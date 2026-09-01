"use strict";
/**
 * ModelRegistry — Phase 20.2
 *
 * Tracks health, quota, latency and reliability for every individual AI model
 * (not just providers). Each OpenRouter model is a separate entry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRegistry = void 0;
// ─── Cooldown Defaults ────────────────────────────────────────────────────────
const RATE_LIMIT_COOLDOWN_MS = parseInt(process.env.AI_RATE_LIMIT_COOLDOWN_MS || '30000');
const QUOTA_RECHECK_MS = parseInt(process.env.AI_QUOTA_RECHECK_MS || '900000'); // 15 min recheck
const HEALTH_RECHECK_MS = parseInt(process.env.AI_MODEL_HEALTH_RECHECK_MS || '60000');
class ModelRegistryImpl {
    models = new Map();
    /**
     * Register a model entry.
     */
    register(entry) {
        this.models.set(entry.id, entry);
    }
    /**
     * Get all registered models.
     */
    getAll() {
        return Array.from(this.models.values());
    }
    /**
     * Get a specific model by ID.
     */
    get(id) {
        return this.models.get(id);
    }
    /**
     * Get all models that are currently eligible (AVAILABLE or past cooldown).
     * Automatically transitions models out of cooldown.
     */
    getEligible(excludeIds = []) {
        const now = Date.now();
        const eligible = [];
        for (const model of this.models.values()) {
            if (excludeIds.includes(model.id))
                continue;
            if (model.status === 'DISABLED' || model.status === 'OFFLINE')
                continue;
            // Auto-recover from cooldown/rate-limit
            if ((model.status === 'COOLDOWN' || model.status === 'RATE_LIMITED') &&
                model.cooldownUntil &&
                now >= model.cooldownUntil) {
                model.status = 'AVAILABLE';
                model.cooldownUntil = null;
                model.consecutiveFailures = 0;
                console.log(`[ModelRegistry] ${model.id} recovered from cooldown → AVAILABLE`);
            }
            // Recheck quota-exhausted models on a schedule
            if (model.status === 'QUOTA_EXHAUSTED') {
                const recheckAt = model.quotaResetAt || (model.lastFailureAt + QUOTA_RECHECK_MS);
                if (now >= recheckAt) {
                    model.status = 'AVAILABLE';
                    model.quotaResetAt = null;
                    model.consecutiveFailures = 0;
                    console.log(`[ModelRegistry] ${model.id} quota recheck window reached → AVAILABLE (half-open)`);
                }
                else {
                    continue; // still exhausted
                }
            }
            if (model.status === 'AVAILABLE' || model.status === 'ACTIVE') {
                eligible.push(model);
            }
        }
        return eligible;
    }
    /**
     * Record a successful request.
     */
    recordSuccess(id, latencyMs) {
        const model = this.models.get(id);
        if (!model)
            return;
        model.status = 'AVAILABLE';
        model.totalRequests++;
        model.successfulRequests++;
        model.totalLatencyMs += latencyMs;
        model.lastSuccessAt = Date.now();
        model.lastUsedAt = Date.now();
        model.consecutiveFailures = 0;
        model.cooldownUntil = null;
    }
    /**
     * Record a failure and classify it.
     * Returns the classified error type.
     */
    recordFailure(id, error) {
        const model = this.models.get(id);
        if (!model)
            return 'TRANSIENT';
        const now = Date.now();
        model.totalRequests++;
        model.failedRequests++;
        model.consecutiveFailures++;
        model.lastFailureAt = now;
        model.lastUsedAt = now;
        const errorClass = this.classifyError(error);
        switch (errorClass) {
            case 'QUOTA_EXHAUSTED': {
                model.status = 'QUOTA_EXHAUSTED';
                model.cooldownUntil = null;
                // Try to extract retryDelay or use default 15-minute recheck
                const quotaReset = this.extractQuotaReset(error);
                model.quotaResetAt = quotaReset || (now + QUOTA_RECHECK_MS);
                console.warn(`[ModelRegistry] ${model.id} → QUOTA_EXHAUSTED. Recheck at ${new Date(model.quotaResetAt).toISOString()}`);
                break;
            }
            case 'RATE_LIMITED': {
                model.status = 'RATE_LIMITED';
                const retryDelay = this.extractRetryDelay(error) || RATE_LIMIT_COOLDOWN_MS;
                model.cooldownUntil = now + retryDelay;
                console.warn(`[ModelRegistry] ${model.id} → RATE_LIMITED. Cooldown until ${new Date(model.cooldownUntil).toISOString()}`);
                break;
            }
            case 'OFFLINE': {
                model.status = 'OFFLINE';
                model.cooldownUntil = null;
                console.error(`[ModelRegistry] ${model.id} → OFFLINE (not configured or auth failure)`);
                break;
            }
            case 'TRANSIENT':
            default: {
                if (model.consecutiveFailures >= 3) {
                    model.status = 'COOLDOWN';
                    model.cooldownUntil = now + HEALTH_RECHECK_MS;
                    console.warn(`[ModelRegistry] ${model.id} → COOLDOWN after ${model.consecutiveFailures} failures`);
                }
                else {
                    model.status = 'AVAILABLE'; // still eligible, just degraded
                }
                break;
            }
        }
        return errorClass;
    }
    /**
     * Calculate selection score for a model.
     * Higher = better candidate.
     */
    score(model) {
        const successRate = model.totalRequests > 0
            ? model.successfulRequests / model.totalRequests
            : 1.0; // no history = optimistic
        const avgLatency = model.totalRequests > 0
            ? model.totalLatencyMs / model.successfulRequests || 5000
            : 3000; // assume 3s for new models
        const latencyScore = Math.max(0, 1 - (avgLatency / 30000)); // normalize against 30s max
        const reliabilityScore = successRate;
        const priorityScore = 1 - (model.priority - 1) * 0.1; // priority 1 = 1.0, priority 5 = 0.6
        const failurePenalty = Math.max(0, 1 - model.consecutiveFailures * 0.2);
        return (reliabilityScore * 0.35 +
            latencyScore * 0.25 +
            priorityScore * 0.25 +
            failurePenalty * 0.15);
    }
    /**
     * Get full status snapshot for monitoring/UI.
     */
    getStatus() {
        return Array.from(this.models.values()).map(m => ({
            id: m.id,
            provider: m.provider,
            modelName: m.modelName,
            role: m.role,
            status: m.status,
            successRate: m.totalRequests > 0
                ? `${((m.successfulRequests / m.totalRequests) * 100).toFixed(1)}%`
                : 'N/A',
            avgLatencyMs: m.successfulRequests > 0
                ? Math.round(m.totalLatencyMs / m.successfulRequests)
                : 0,
            cooldownUntil: m.cooldownUntil,
            quotaResetAt: m.quotaResetAt,
            consecutiveFailures: m.consecutiveFailures,
            totalRequests: m.totalRequests,
        }));
    }
    // ─── Error Parsing ────────────────────────────────────────────────────────
    classifyError(error) {
        const msg = (error?.message || '').toLowerCase();
        // Daily quota — MUST check before generic 429
        if (msg.includes('daily_quota_exhausted') ||
            msg.includes('generaterequestsperdayperproject') ||
            msg.includes('free_tier') ||
            (msg.includes('quota') && (msg.includes('day') || msg.includes('exhausted')))) {
            return 'QUOTA_EXHAUSTED';
        }
        // Temporary rate limit
        if (msg.includes('rate_limited') ||
            msg.includes('rate limit') ||
            msg.includes('too many requests') ||
            msg.includes('429')) {
            return 'RATE_LIMITED';
        }
        // Offline / auth
        if (msg.includes('offline') ||
            msg.includes('not configured') ||
            msg.includes('unauthorized') ||
            msg.includes('401') ||
            msg.includes('403')) {
            return 'OFFLINE';
        }
        return 'TRANSIENT';
    }
    extractRetryDelay(error) {
        const msg = error?.message || '';
        const match = msg.match(/retry[_\s-]?(?:after|in|delay)[:\s]+([0-9.]+)\s*s/i);
        if (match) {
            return Math.ceil(parseFloat(match[1]) * 1000) + 2000; // add 2s buffer
        }
        return null;
    }
    extractQuotaReset(error) {
        // Some providers return a reset timestamp — parse if available
        // For now, rely on QUOTA_RECHECK_MS
        return null;
    }
}
exports.ModelRegistry = new ModelRegistryImpl();
