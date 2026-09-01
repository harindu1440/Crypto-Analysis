"use strict";
/**
 * DynamicModelRouter — Phase 20.2
 *
 * The central AI request router. Before every AI call it:
 *  1. Queries ModelRegistry for eligible models (AVAILABLE, not in cooldown)
 *  2. Scores them and selects the best
 *  3. Executes the request
 *  4. On failure: classifies error, marks model, selects next candidate
 *  5. Retries up to AI_MAX_FAILOVER_ATTEMPTS times with different models
 *  6. Only if ALL candidates fail → returns AI_UNAVAILABLE result
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicModelRouter = exports.AIUnavailableError = void 0;
const modelRegistry_1 = require("./modelRegistry");
const eventBus_1 = require("../system/eventBus");
const MAX_FAILOVER_ATTEMPTS = parseInt(process.env.AI_MAX_FAILOVER_ATTEMPTS || '4');
const PROVIDER_TIMEOUT_MS = parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || '15000');
// ─── All-fail result type ─────────────────────────────────────────────────────
class AIUnavailableError extends Error {
    attemptedModels;
    constructor(attemptedModels) {
        super('AI_UNAVAILABLE: All eligible models exhausted.');
        this.name = 'AIUnavailableError';
        this.attemptedModels = attemptedModels;
    }
}
exports.AIUnavailableError = AIUnavailableError;
// ─── DynamicModelRouter ───────────────────────────────────────────────────────
class DynamicModelRouterImpl {
    /**
     * Main entry point.
     * Execute a generateObject call with automatic failover.
     *
     * @param prompt      The user/data prompt
     * @param schemaName  Schema name (e.g. 'ScreeningAnalysis', 'MasterDecision')
     * @param systemPrompt Optional system instruction
     * @param taskLabel   Human-readable task label for logs (e.g. 'Screening:BTCUSDT')
     */
    async executeWithFailover(prompt, schemaName, systemPrompt, taskLabel) {
        const attempted = [];
        let failoverCount = 0;
        console.log(`[AI Router] ${taskLabel}: Selecting model...`);
        while (attempted.length < MAX_FAILOVER_ATTEMPTS) {
            // Get eligible models, excluding already attempted ones
            const candidates = modelRegistry_1.ModelRegistry.getEligible(attempted);
            if (candidates.length === 0) {
                this.logPoolStatus(taskLabel, attempted);
                throw new AIUnavailableError(attempted);
            }
            // Score and select the best
            const selected = this.selectBest(candidates);
            attempted.push(selected.id);
            console.log(`[AI Router] ${taskLabel}: Selected ${selected.provider}/${selected.modelName}` +
                (failoverCount > 0 ? ` (failover attempt ${failoverCount})` : ''));
            // Execute with timeout
            const startMs = Date.now();
            try {
                const result = await this.withTimeout(selected.providerInstance.generateObject(prompt, schemaName, systemPrompt), PROVIDER_TIMEOUT_MS, `${selected.id} timed out after ${PROVIDER_TIMEOUT_MS}ms`);
                const latencyMs = Date.now() - startMs;
                modelRegistry_1.ModelRegistry.recordSuccess(selected.id, latencyMs);
                console.log(`[AI Router] ${taskLabel}: SUCCESS ` +
                    `| Provider: ${selected.provider} | Model: ${selected.modelName} | Latency: ${latencyMs}ms`);
                if (failoverCount > 0) {
                    eventBus_1.EventBus.publish({
                        eventType: 'SYSTEM_ALERT',
                        source: 'DynamicModelRouter',
                        payload: {
                            message: `AI failover succeeded. Active model: ${selected.provider}/${selected.modelName}`,
                            activeModel: selected.id,
                            failoverCount,
                            attempted
                        }
                    });
                }
                return { data: result, modelId: selected.id, provider: selected.provider, modelName: selected.modelName, latencyMs, failoverCount };
            }
            catch (err) {
                const latencyMs = Date.now() - startMs;
                const errorClass = modelRegistry_1.ModelRegistry.recordFailure(selected.id, err);
                console.warn(`[AI Router] ${taskLabel}: FAILED on ${selected.id} ` +
                    `(${errorClass}, ${latencyMs}ms) — ${err.message?.substring(0, 100)}`);
                failoverCount++;
                // Publish alert for quota/offline failures
                if (errorClass === 'QUOTA_EXHAUSTED' || errorClass === 'OFFLINE') {
                    eventBus_1.EventBus.publish({
                        eventType: 'SYSTEM_ALERT',
                        source: 'DynamicModelRouter',
                        payload: {
                            message: `${selected.provider}/${selected.modelName} is ${errorClass}. Trying next model...`,
                            failedModel: selected.id,
                            errorClass
                        }
                    });
                }
                console.log(`[AI Router] ${taskLabel}: Selecting replacement model...`);
                // Continue to next iteration to pick next best model
            }
        }
        // All attempts exhausted
        this.logPoolStatus(taskLabel, attempted);
        throw new AIUnavailableError(attempted);
    }
    /**
     * Select the highest-scoring eligible model from a list of candidates.
     */
    selectBest(candidates) {
        return candidates.reduce((best, current) => {
            return modelRegistry_1.ModelRegistry.score(current) > modelRegistry_1.ModelRegistry.score(best) ? current : best;
        });
    }
    /**
     * Get current router status for monitoring/UI.
     */
    getRouterStatus() {
        const allModels = modelRegistry_1.ModelRegistry.getStatus();
        const eligible = modelRegistry_1.ModelRegistry.getEligible();
        const activeModel = eligible.length > 0 ? this.selectBest(eligible) : null;
        return {
            activeModel: activeModel ? {
                id: activeModel.id,
                provider: activeModel.provider,
                modelName: activeModel.modelName,
                role: activeModel.role,
            } : null,
            eligibleCount: eligible.length,
            totalModels: allModels.length,
            models: allModels,
        };
    }
    /**
     * Log all model pool statuses for debugging.
     */
    logPoolStatus(taskLabel, attempted) {
        const all = modelRegistry_1.ModelRegistry.getAll();
        const lines = all.map(m => `  ${m.id} = ${m.status}${m.cooldownUntil ? ` (cooldown until ${new Date(m.cooldownUntil).toISOString()})` : ''}`);
        console.warn(`[AI Router] ${taskLabel}: ALL MODELS EXHAUSTED after ${attempted.length} attempt(s).\n` +
            `Attempted: ${attempted.join(', ')}\n` +
            `Pool:\n${lines.join('\n')}`);
    }
    /**
     * Wrap a promise with a timeout.
     */
    withTimeout(promise, ms, timeoutMessage) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
            promise.then((val) => { clearTimeout(timer); resolve(val); }, (err) => { clearTimeout(timer); reject(err); });
        });
    }
}
exports.DynamicModelRouter = new DynamicModelRouterImpl();
