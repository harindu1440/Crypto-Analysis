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

import { ModelRegistry, ModelRegistryEntry, ModelCapabilities } from './modelRegistry';
import { EventBus } from '../system/eventBus';

const MAX_FAILOVER_ATTEMPTS  = parseInt(process.env.AI_MAX_FAILOVER_ATTEMPTS  || '4');
const DEFAULT_TIMEOUT_MS     = parseInt(process.env.AI_PROVIDER_TIMEOUT_MS     || '15000');

// ─── Router Result ────────────────────────────────────────────────────────────
export interface RouterResult<T> {
  data: T;
  modelId: string;
  provider: string;
  modelName: string;
  latencyMs: number;
  failoverCount: number;
}

// ─── Timeout Error ────────────────────────────────────────────────────────────
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
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

// ─── Tracking Context ─────────────────────────────────────────────────────────
export interface RouterTrackingContext {
  analysisRequestId: string;
  roleRequestId?: string;
  expectedTotalRoles?: number;
}

// ─── DynamicModelRouter ───────────────────────────────────────────────────────
class DynamicModelRouterImpl {
  // Track active reservations per analysis ID to enforce concentration limits
  private activeReservations: Map<string, Map<string, number>> = new Map();


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
    taskLabel: string,
    requiredCapabilities?: Partial<ModelCapabilities>,
    trackingContext?: RouterTrackingContext
  ): Promise<RouterResult<T>> {
    const attempted: string[] = [];
    let failoverCount = 0;

    console.log(`[AI Router] ${taskLabel}: Selecting model...`);

    while (attempted.length < MAX_FAILOVER_ATTEMPTS) {
      let selected: ModelRegistryEntry;
      try {
        selected = this.selectAndReserveModel(attempted, requiredCapabilities, trackingContext);
      } catch (err) {
        if (err instanceof AIUnavailableError) {
           this.logPoolStatus(taskLabel, attempted);
           throw new AIUnavailableError(attempted);
        }
        throw err;
      }
      
      attempted.push(selected.id);

      console.log(
        `[AI Router] ${taskLabel}: Selected ${selected.provider}/${selected.modelName}` +
        (failoverCount > 0 ? ` (failover attempt ${failoverCount})` : '')
      );

      const startMs = Date.now();
      // Use per-model timeout, fall back to global default
      const timeoutMs = selected.timeoutMs || DEFAULT_TIMEOUT_MS;
      try {
        const result = await this.withTimeout(
          selected.providerInstance.generateObject<T>(prompt, schemaName, systemPrompt),
          timeoutMs,
          `${selected.id} timed out after ${timeoutMs}ms`
        );

      const latencyMs = Date.now() - startMs;
        ModelRegistry.recordSuccess(selected.id, latencyMs);

        if (failoverCount > 0) {
          // INFO level for successful failover — not critical
          EventBus.publish({
            eventType: 'SYSTEM_ALERT',
            source: 'DynamicModelRouter',
            payload: {
              level: 'INFO',
              message: `[AI Router] Failover succeeded. Active: ${selected.provider}/${selected.modelName}`,
              activeModel: selected.id,
              failoverCount,
              attempted
            }
          });
        }

        console.log(
          `[AI Router] ${taskLabel}: SUCCESS` +
          ` | Provider: ${selected.provider} | Model: ${selected.modelName}` +
          ` | Attempt: ${failoverCount + 1} | Latency: ${latencyMs}ms`
        );

        return { data: result, modelId: selected.id, provider: selected.provider, modelName: selected.modelName, latencyMs, failoverCount };

      } catch (err: any) {
        const latencyMs = Date.now() - startMs;
        const errorClass = ModelRegistry.recordFailure(selected.id, err);

        console.warn(
          `[AI Router] ${taskLabel}: FAILED\n` +
          `  Role: ${taskLabel} | Attempt: ${failoverCount + 1}` +
          ` | Provider: ${selected.provider} | Model: ${selected.modelName}\n` +
          `  Result: ${errorClass} | Latency: ${latencyMs}ms\n` +
          `  Message: ${err.message?.substring(0, 150)}`
        );

        // EventBus alerts — use appropriate severity
        const alertLevel =
          errorClass === 'QUOTA_EXHAUSTED'      ? 'WARNING' :
          errorClass === 'TIMEOUT'              ? 'WARNING' :
          errorClass === 'AUTHENTICATION_ERROR' ? 'ERROR'   :
          errorClass === 'MODEL_NOT_FOUND'      ? 'ERROR'   :
          errorClass === 'INVALID_RESPONSE'     ? 'WARNING' :
          errorClass === 'NETWORK_ERROR'        ? 'WARNING' : 'INFO';

        if (alertLevel !== 'INFO') {
          EventBus.publish({
            eventType: 'SYSTEM_ALERT',
            source: 'DynamicModelRouter',
            payload: {
              level: alertLevel,
              message: `${selected.provider}/${selected.modelName} → ${errorClass}. Trying next model.`,
              failedModel: selected.id,
              errorClass
            }
          });
        }

        failoverCount++;
        console.log(`[AI Router] ${taskLabel}: Selecting replacement model...`);
        // Continue to next iteration to pick next best model
      } finally {
        this.releaseModel(selected.id, trackingContext?.analysisRequestId);
      }
    }

    // All attempts exhausted
    this.logPoolStatus(taskLabel, attempted);
    // CRITICAL: emit only when no eligible AI exists at all
    EventBus.publish({
      eventType: 'SYSTEM_ALERT',
      source: 'DynamicModelRouter',
      payload: {
        level: 'CRITICAL',
        message: `AI_UNAVAILABLE: All ${attempted.length} eligible models exhausted for ${taskLabel}. No analysis possible.`,
        attempted
      }
    });
    throw new AIUnavailableError(attempted);
  }

  /**
   * Atomically select and reserve a model, incrementing its active requests count.
   */
  public selectAndReserveModel(
      excludeIds: string[], 
      requiredCapabilities?: Partial<ModelCapabilities>,
      trackingContext?: RouterTrackingContext
  ): ModelRegistryEntry {
    const candidates = ModelRegistry.getEligible(excludeIds).filter(model => {
       if (!requiredCapabilities) return true;
       // Check if model satisfies all required capabilities
       for (const [key, value] of Object.entries(requiredCapabilities)) {
          if (value && !(model.capabilities as any)[key]) return false;
       }
       return true;
    });

    if (candidates.length === 0) {
      throw new AIUnavailableError(excludeIds);
    }
    
    // Evaluate concentration
    let concentrationCounts: Map<string, number> | undefined;
    if (trackingContext?.analysisRequestId) {
       concentrationCounts = this.activeReservations.get(trackingContext.analysisRequestId);
    }
    const maxConcentrationPercent = parseInt(process.env.AI_MAX_MODEL_CONCENTRATION_PERCENT || '40');
    const expectedRoles = trackingContext?.expectedTotalRoles || 5;

    const selected = candidates.reduce((best, current) => {
      let bestScore = ModelRegistry.score(best);
      let currentScore = ModelRegistry.score(current);
      
      const now = Date.now();
      // Recent usage penalty: If used in the last 15 seconds (e.g. for screening), penalize slightly
      if (best.lastUsedAt && (now - best.lastUsedAt) < 15000) bestScore -= 0.15;
      if (current.lastUsedAt && (now - current.lastUsedAt) < 15000) currentScore -= 0.15;
      
      // Concentration penalty
      if (concentrationCounts) {
         const bestCount = concentrationCounts.get(best.id) || 0;
         const currentCount = concentrationCounts.get(current.id) || 0;
         if ((bestCount / expectedRoles) * 100 > maxConcentrationPercent) bestScore -= 0.4;
         if ((currentCount / expectedRoles) * 100 > maxConcentrationPercent) currentScore -= 0.4;
      }
      
      return currentScore > bestScore ? current : best;
    });

    selected.activeRequests++;
    
    // Track reservation
    if (trackingContext?.analysisRequestId) {
       if (!this.activeReservations.has(trackingContext.analysisRequestId)) {
          this.activeReservations.set(trackingContext.analysisRequestId, new Map());
       }
       const counts = this.activeReservations.get(trackingContext.analysisRequestId)!;
       counts.set(selected.id, (counts.get(selected.id) || 0) + 1);
    }
    
    return selected;
  }

  /**
   * Release a previously reserved model.
   */
  public releaseModel(id: string, analysisRequestId?: string): void {
     const model = ModelRegistry.get(id);
     if (model && model.activeRequests > 0) {
        model.activeRequests--;
     }
     
     if (analysisRequestId) {
        const counts = this.activeReservations.get(analysisRequestId);
        if (counts && counts.has(id)) {
           const newCount = counts.get(id)! - 1;
           if (newCount <= 0) {
              counts.delete(id);
           } else {
              counts.set(id, newCount);
           }
           if (counts.size === 0) {
              this.activeReservations.delete(analysisRequestId);
           }
        }
     }
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

  /** Log pool status separating eligible from disabled. */
  private logPoolStatus(taskLabel: string, attempted: string[]): void {
    const all = ModelRegistry.getAll();
    const eligible = all.filter(m =>
      !['DISABLED', 'OFFLINE', 'FAILED', 'QUOTA_EXHAUSTED'].includes(m.status)
    );
    const disabled = all.filter(m =>
      ['DISABLED', 'OFFLINE', 'FAILED'].includes(m.status)
    );
    const quotaExhausted = all.filter(m => m.status === 'QUOTA_EXHAUSTED');

    const eligibleLines  = eligible.map(m =>
      `  ELIGIBLE  ${m.id} = ${m.status}${m.cooldownUntil ? ` (until ${new Date(m.cooldownUntil).toISOString()})` : ''}`
    );
    const disabledLines  = disabled.map(m  => `  DISABLED  ${m.id}`);
    const exhaustedLines = quotaExhausted.map(m => `  QUOTA_EXH ${m.id} (recheck: ${m.quotaResetAt ? new Date(m.quotaResetAt).toISOString() : 'N/A'})`);

    console.warn(
      `[AI Router] ${taskLabel}: ALL MODELS EXHAUSTED after ${attempted.length} attempt(s).\n` +
      `Attempted: ${attempted.join(', ')}\n` +
      `Registered: ${all.length} | Eligible: ${eligible.length} | Disabled: ${disabled.length}\n` +
      [...eligibleLines, ...exhaustedLines, ...disabledLines].join('\n')
    );
  }

  /**
   * Wrap a promise with a timeout.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(timeoutMessage)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }
}

export const DynamicModelRouter = new DynamicModelRouterImpl();
