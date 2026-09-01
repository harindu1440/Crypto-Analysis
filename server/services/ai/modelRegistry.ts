/**
 * ModelRegistry — Phase 20.2
 * 
 * Tracks health, quota, latency and reliability for every individual AI model
 * (not just providers). Each OpenRouter model is a separate entry.
 */

import { AIProvider } from './providers/provider.interface';
import { AIRole } from './providers/providerRegistry';

// ─── Model Status ─────────────────────────────────────────────────────────────
export type ModelStatus =
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'COOLDOWN'
  | 'FAILED'
  | 'DISABLED'
  | 'OFFLINE'
  | 'UNKNOWN';

// ─── Error Classification ─────────────────────────────────────────────────────
export type ErrorClass =
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'TRANSIENT'
  | 'OFFLINE'
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'UNSUPPORTED_MODEL'
  | 'SCHEMA_ERROR'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN';

// ─── Model Capabilities ───────────────────────────────────────────────────────
export interface ModelCapabilities {
  structuredOutput: boolean;
  json: boolean;
  reasoning: boolean;
  technicalAnalysis: boolean;
  riskAnalysis: boolean;
}

// ─── Model Registry Entry ─────────────────────────────────────────────────────
export interface ModelRegistryEntry {
  id: string;                    // e.g. "gemini:gemini-3.6-flash"
  provider: string;              // "gemini" | "groq" | "openrouter" | "huggingface"
  modelName: string;             // actual API model identifier
  providerInstance: AIProvider;  // live provider instance
  role: AIRole;
  priority: number;              // lower = higher priority
  status: ModelStatus;
  capabilities: ModelCapabilities;
  activeRequests: number;
  maxConcurrentRequests: number;
  cooldownUntil: number | null;
  quotaResetAt: number | null;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  lastUsedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

// ─── Cooldown Defaults ────────────────────────────────────────────────────────
const RATE_LIMIT_COOLDOWN_MS = parseInt(process.env.AI_RATE_LIMIT_COOLDOWN_MS || '30000');
const QUOTA_RECHECK_MS = parseInt(process.env.AI_QUOTA_RECHECK_MS || '900000');   // 15 min recheck
const HEALTH_RECHECK_MS = parseInt(process.env.AI_MODEL_HEALTH_RECHECK_MS || '60000');

class ModelRegistryImpl {
  private models: Map<string, ModelRegistryEntry> = new Map();

  /**
   * Register a model entry.
   */
  public register(entry: ModelRegistryEntry): void {
    this.models.set(entry.id, entry);
  }

  /**
   * Get all registered models.
   */
  public getAll(): ModelRegistryEntry[] {
    return Array.from(this.models.values());
  }

  /**
   * Get a specific model by ID.
   */
  public get(id: string): ModelRegistryEntry | undefined {
    return this.models.get(id);
  }

  /**
   * Get all models that are currently eligible (AVAILABLE or past cooldown).
   * Automatically transitions models out of cooldown.
   */
  public getEligible(excludeIds: string[] = []): ModelRegistryEntry[] {
    const now = Date.now();
    const eligible: ModelRegistryEntry[] = [];

    for (const model of this.models.values()) {
      if (excludeIds.includes(model.id)) continue;
      if (model.status === 'DISABLED' || model.status === 'OFFLINE') continue;

      // Auto-recover from cooldown/rate-limit
      if (
        (model.status === 'COOLDOWN' || model.status === 'RATE_LIMITED') &&
        model.cooldownUntil &&
        now >= model.cooldownUntil
      ) {
        model.status = 'AVAILABLE';
        model.cooldownUntil = null;
        model.consecutiveFailures = 0;
        console.log(`[ModelRegistry] ${model.id} recovered from cooldown → AVAILABLE`);
      }

      // Recheck quota-exhausted models on a schedule
      if (model.status === 'QUOTA_EXHAUSTED') {
        const recheckAt = model.quotaResetAt || (model.lastFailureAt! + QUOTA_RECHECK_MS);
        if (now >= recheckAt) {
          model.status = 'AVAILABLE';
          model.quotaResetAt = null;
          model.consecutiveFailures = 0;
          console.log(`[ModelRegistry] ${model.id} quota recheck window reached → AVAILABLE (half-open)`);
        } else {
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
  public recordSuccess(id: string, latencyMs: number): void {
    const model = this.models.get(id);
    if (!model) return;

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
  public recordFailure(id: string, error: any): ErrorClass {
    const model = this.models.get(id);
    if (!model) return 'TRANSIENT';

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

      case 'OFFLINE':
      case 'AUTHENTICATION_ERROR': {
        model.status = 'OFFLINE';
        model.cooldownUntil = null;
        console.error(`[ModelRegistry] ${model.id} → OFFLINE (not configured or auth failure)`);
        break;
      }

      case 'INVALID_REQUEST':
      case 'MODEL_NOT_FOUND':
      case 'UNSUPPORTED_MODEL':
      case 'SCHEMA_ERROR': {
        model.status = 'DISABLED';
        model.cooldownUntil = null;
        console.error(`[ModelRegistry] ${model.id} → DISABLED (Permanent error: ${errorClass})`);
        break;
      }

      case 'PROVIDER_ERROR':
      case 'UNKNOWN':
      case 'TRANSIENT':
      default: {
        if (model.consecutiveFailures >= 3) {
          model.status = 'COOLDOWN';
          model.cooldownUntil = now + HEALTH_RECHECK_MS;
          console.warn(`[ModelRegistry] ${model.id} → COOLDOWN after ${model.consecutiveFailures} failures`);
        } else {
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
  public score(model: ModelRegistryEntry): number {
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
    
    // Penalize models that are currently handling their max concurrency
    // This pushes the router to distribute requests to other capable models first.
    let loadScore = 1.0;
    if (model.maxConcurrentRequests > 0) {
      if (model.activeRequests >= model.maxConcurrentRequests) {
         loadScore = 0.1; // Heavy penalty but not zero (in case it's the only eligible model left)
      } else {
         loadScore = 1 - (model.activeRequests / model.maxConcurrentRequests) * 0.5; // Up to 50% penalty as it fills up
      }
    }

    return (
      reliabilityScore * 0.30 +
      latencyScore * 0.20 +
      priorityScore * 0.20 +
      loadScore * 0.20 +
      failurePenalty * 0.10
    );
  }

  /**
   * Get full status snapshot for monitoring/UI.
   */
  public getStatus(): Array<{
    id: string;
    provider: string;
    modelName: string;
    role: string;
    status: ModelStatus;
    successRate: string;
    avgLatencyMs: number;
    cooldownUntil: number | null;
    quotaResetAt: number | null;
    consecutiveFailures: number;
    totalRequests: number;
  }> {
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

  public classifyError(error: any): ErrorClass {
    const msg = (error?.message || '').toLowerCase();

    // Daily quota — MUST check before generic 429
    if (
      msg.includes('daily_quota_exhausted') ||
      msg.includes('generaterequestsperdayperproject') ||
      msg.includes('free_tier') ||
      (msg.includes('quota') && (msg.includes('day') || msg.includes('exhausted')))
    ) {
      return 'QUOTA_EXHAUSTED';
    }

    // Temporary rate limit
    if (
      msg.includes('rate_limited') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('429')
    ) {
      return 'RATE_LIMITED';
    }

    // Offline / auth
    if (
      msg.includes('offline') ||
      msg.includes('not configured') ||
      msg.includes('unauthorized') ||
      msg.includes('401') ||
      msg.includes('403')
    ) {
      return 'AUTHENTICATION_ERROR';
    }
    
    // Invalid requests / unsupported models (e.g., Groq 400 Bad Request)
    if (
      msg.includes('model not found') ||
      msg.includes('does not exist') ||
      msg.includes('invalid model') ||
      msg.includes('unsupported model')
    ) {
      return 'MODEL_NOT_FOUND';
    }
    
    if (
      msg.includes('invalid parameter') ||
      msg.includes('invalid request') ||
      msg.includes('schema') ||
      msg.includes('400') ||
      msg.includes('bad request')
    ) {
      return 'INVALID_REQUEST';
    }
    
    if (msg.includes('50') || msg.includes('timeout')) {
      return 'PROVIDER_ERROR';
    }

    return 'TRANSIENT';
  }

  private extractRetryDelay(error: any): number | null {
    const msg = error?.message || '';
    const match = msg.match(/retry[_\s-]?(?:after|in|delay)[:\s]+([0-9.]+)\s*s/i);
    if (match) {
      return Math.ceil(parseFloat(match[1]) * 1000) + 2000; // add 2s buffer
    }
    return null;
  }

  private extractQuotaReset(error: any): number | null {
    // Some providers return a reset timestamp — parse if available
    // For now, rely on QUOTA_RECHECK_MS
    return null;
  }
}

export const ModelRegistry = new ModelRegistryImpl();
