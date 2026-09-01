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

import { ModelRegistry, ModelRegistryEntry } from './modelRegistry';
import { EventBus } from '../system/eventBus';

const MAX_FAILOVER_ATTEMPTS = parseInt(process.env.AI_MAX_FAILOVER_ATTEMPTS || '4');
const PROVIDER_TIMEOUT_MS = parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || '15000');

// ─── Router Result ────────────────────────────────────────────────────────────
export interface RouterResult<T> {
  data: T;
  modelId: string;
  provider: string;
  modelName: string;
  latencyMs: number;
  failoverCount: number;
}

// ─── All-fail result type ─────────────────────────────────────────────────────
export class AIUnavailableError extends Error {
  public readonly attemptedModels: string[];
  constructor(attemptedModels: string[]) {
    super('AI_UNAVAILABLE: All eligible models exhausted.');
    this.name = 'AIUnavailableError';
    this.attemptedModels = attemptedModels;
  }
}

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
  public async executeWithFailover<T>(
    prompt: string,
    schemaName: string,
    systemPrompt: string | undefined,
    taskLabel: string
  ): Promise<RouterResult<T>> {
    const attempted: string[] = [];
    let failoverCount = 0;

    console.log(`[AI Router] ${taskLabel}: Selecting model...`);

    while (attempted.length < MAX_FAILOVER_ATTEMPTS) {
      // Get eligible models, excluding already attempted ones
      const candidates = ModelRegistry.getEligible(attempted);

      if (candidates.length === 0) {
        this.logPoolStatus(taskLabel, attempted);
        throw new AIUnavailableError(attempted);
      }

      // Score and select the best
      const selected = this.selectBest(candidates);
      attempted.push(selected.id);

      console.log(
        `[AI Router] ${taskLabel}: Selected ${selected.provider}/${selected.modelName}` +
        (failoverCount > 0 ? ` (failover attempt ${failoverCount})` : '')
      );

      // Execute with timeout
      const startMs = Date.now();
      try {
        const result = await this.withTimeout(
          selected.providerInstance.generateObject<T>(prompt, schemaName, systemPrompt),
          PROVIDER_TIMEOUT_MS,
          `${selected.id} timed out after ${PROVIDER_TIMEOUT_MS}ms`
        );

        const latencyMs = Date.now() - startMs;
        ModelRegistry.recordSuccess(selected.id, latencyMs);

        console.log(
          `[AI Router] ${taskLabel}: SUCCESS ` +
          `| Provider: ${selected.provider} | Model: ${selected.modelName} | Latency: ${latencyMs}ms`
        );

        if (failoverCount > 0) {
          EventBus.publish({
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

      } catch (err: any) {
        const latencyMs = Date.now() - startMs;
        const errorClass = ModelRegistry.recordFailure(selected.id, err);

        console.warn(
          `[AI Router] ${taskLabel}: FAILED on ${selected.id} ` +
          `(${errorClass}, ${latencyMs}ms) — ${err.message?.substring(0, 100)}`
        );

        failoverCount++;

        // Publish alert for quota/offline failures
        if (errorClass === 'QUOTA_EXHAUSTED' || errorClass === 'OFFLINE') {
          EventBus.publish({
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
  public selectBest(candidates: ModelRegistryEntry[]): ModelRegistryEntry {
    return candidates.reduce((best, current) => {
      return ModelRegistry.score(current) > ModelRegistry.score(best) ? current : best;
    });
  }

  /**
   * Get current router status for monitoring/UI.
   */
  public getRouterStatus() {
    const allModels = ModelRegistry.getStatus();
    const eligible = ModelRegistry.getEligible();

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
  private logPoolStatus(taskLabel: string, attempted: string[]): void {
    const all = ModelRegistry.getAll();
    const lines = all.map(m =>
      `  ${m.id} = ${m.status}${m.cooldownUntil ? ` (cooldown until ${new Date(m.cooldownUntil).toISOString()})` : ''}`
    );
    console.warn(
      `[AI Router] ${taskLabel}: ALL MODELS EXHAUSTED after ${attempted.length} attempt(s).\n` +
      `Attempted: ${attempted.join(', ')}\n` +
      `Pool:\n${lines.join('\n')}`
    );
  }

  /**
   * Wrap a promise with a timeout.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }
}

export const DynamicModelRouter = new DynamicModelRouterImpl();
