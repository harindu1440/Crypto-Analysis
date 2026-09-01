/**
 * ModelRegistry — Phase 20.4
 *
 * Per-model health tracking, quota management, adaptive latency scoring,
 * and deterministic error classification. Each OpenRouter model is a separate
 * entry so provider-level health never masks model-level issues.
 */

import { AIProvider } from './providers/provider.interface';
import { AIRole } from './providers/providerRegistry';

// ─── Model Status ─────────────────────────────────────────────────────────────
export type ModelStatus =
  | 'CONFIGURED'      // registered, not yet validated
  | 'AVAILABLE'       // healthy, ready
  | 'ACTIVE'          // reserved, handling request
  | 'DEGRADED'        // had failures/timeouts — eligible but penalised
  | 'PROBING'         // half-open: cooldown expired, next call is a health probe
  | 'RATE_LIMITED'    // 429 temp, recovers after retryDelay
  | 'QUOTA_EXHAUSTED' // daily quota, excluded until recheck
  | 'COOLDOWN'        // temporarily unavailable, auto-recovers
  | 'SLOW'            // legacy — maps to DEGRADED behaviour
  | 'FAILED'
  | 'DISABLED'        // permanent — decommissioned, 404, auth fail
  | 'OFFLINE'         // not configured / no credentials
  | 'UNKNOWN';

// ─── Error Classification ─────────────────────────────────────────────────────
export type ErrorClass =
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'  // non-JSON / safety message / malformed provider output
  | 'OFFLINE'
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'UNSUPPORTED_MODEL'
  | 'SCHEMA_ERROR'
  | 'PROVIDER_ERROR'
  | 'TRANSIENT'
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
  timeoutMs: number;             // per-model request timeout
  cooldownUntil: number | null;
  quotaResetAt: number | null;
  consecutiveFailures: number;
  consecutiveTimeouts: number;   // for exponential timeout backoff
  timeoutCount: number;          // lifetime count
  invalidResponseCount: number;  // malformed / non-JSON responses
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  lastUsedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  lastTimeoutAt: number | null;
}

// ─── Cooldown Defaults ────────────────────────────────────────────────────────
const RATE_LIMIT_COOLDOWN_MS   = parseInt(process.env.AI_RATE_LIMIT_COOLDOWN_MS   || '30000');
const QUOTA_RECHECK_MS         = parseInt(process.env.AI_QUOTA_RECHECK_MS         || '900000'); // 15 min
const HEALTH_RECHECK_MS        = parseInt(process.env.AI_MODEL_HEALTH_RECHECK_MS  || '60000');
const TIMEOUT_COOLDOWN_BASE_MS = parseInt(process.env.AI_TIMEOUT_COOLDOWN_BASE_MS || '30000');
const TIMEOUT_COOLDOWN_MAX_MS  = parseInt(process.env.AI_TIMEOUT_COOLDOWN_MAX_MS  || '300000');

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
   * Get all models currently eligible.
   * DEGRADED and PROBING are included (penalised in score).
   * Auto-transitions COOLDOWN/RATE_LIMITED → PROBING when window expires.
   */
  public getEligible(excludeIds: string[] = []): ModelRegistryEntry[] {
    const now = Date.now();
    const eligible: ModelRegistryEntry[] = [];

    for (const model of this.models.values()) {
      if (excludeIds.includes(model.id)) continue;

      // Hard exclusions
      if (
        model.status === 'DISABLED' ||
        model.status === 'OFFLINE'  ||
        model.status === 'FAILED'
      ) continue;

      // Auto-recover cooldown/rate-limit/DEGRADED → PROBING (half-open)
      if (
        (model.status === 'COOLDOWN' || model.status === 'RATE_LIMITED' || model.status === 'DEGRADED') &&
        model.cooldownUntil &&
        now >= model.cooldownUntil
      ) {
        model.status = 'PROBING';
        model.cooldownUntil = null;
        console.log(`[ModelRegistry] ${model.id} cooldown expired → PROBING (half-open)`);
      }

      // Quota recheck
      if (model.status === 'QUOTA_EXHAUSTED') {
        const recheckAt = model.quotaResetAt || (model.lastFailureAt! + QUOTA_RECHECK_MS);
        if (now >= recheckAt) {
          model.status = 'PROBING';
          model.quotaResetAt = null;
          model.consecutiveFailures = 0;
          console.log(`[ModelRegistry] ${model.id} quota recheck → PROBING (half-open)`);
        } else {
          continue;
        }
      }

      // Skip still-cooling models
      if (
        (model.status === 'COOLDOWN' || model.status === 'RATE_LIMITED') &&
        model.cooldownUntil && now < model.cooldownUntil
      ) continue;

      if (
        model.status === 'AVAILABLE'  ||
        model.status === 'ACTIVE'     ||
        model.status === 'CONFIGURED' ||
        model.status === 'DEGRADED'   ||
        model.status === 'PROBING'    ||
        model.status === 'SLOW'
      ) {
        eligible.push(model);
      }
    }

    return eligible;
  }

  /** Record a successful request. Resets all failure/timeout counters. */
  public recordSuccess(id: string, latencyMs: number): void {
    const model = this.models.get(id);
    if (!model) return;

    const wasProbing = model.status === 'PROBING';

    model.status = 'AVAILABLE';
    model.totalRequests++;
    model.successfulRequests++;
    model.totalLatencyMs += latencyMs;
    // EMA: 80% history, 20% new observation
    model.averageLatencyMs =
      model.averageLatencyMs === 0
        ? latencyMs
        : (model.averageLatencyMs * 0.8) + (latencyMs * 0.2);

    // Reset all consecutive failure counters on success
    model.consecutiveFailures = 0;
    model.consecutiveTimeouts = 0;
    if (model.timeoutCount > 0)         model.timeoutCount         = Math.max(0, model.timeoutCount - 1);
    if (model.invalidResponseCount > 0) model.invalidResponseCount = Math.max(0, model.invalidResponseCount - 1);

    model.lastSuccessAt = Date.now();
    model.lastUsedAt    = Date.now();
    model.cooldownUntil = null;

    if (wasProbing) console.log(`[ModelRegistry] ${model.id} probe SUCCESS → AVAILABLE`);
  }

  /**
   * Record a failure. Classifies error, applies correct state transition.
   * Returns the classified error type for router logging.
   */
  public recordFailure(id: string, error: any): ErrorClass {
    const model = this.models.get(id);
    if (!model) return 'TRANSIENT';

    const now = Date.now();
    model.totalRequests++;
    model.failedRequests++;
    model.consecutiveFailures++;
    model.lastFailureAt = now;
    model.lastUsedAt    = now;

    const errorClass = this.classifyError(error);

    switch (errorClass) {

      // ── Permanent / long-term ─────────────────────────────────────────
      case 'QUOTA_EXHAUSTED': {
        model.status = 'QUOTA_EXHAUSTED';
        model.cooldownUntil = null;
        const quotaReset = this.extractQuotaReset(error);
        model.quotaResetAt = quotaReset || (now + QUOTA_RECHECK_MS);
        console.warn(`[ModelRegistry] ${model.id} → QUOTA_EXHAUSTED. Recheck at ${new Date(model.quotaResetAt).toISOString()}`);
        break;
      }

      case 'OFFLINE':
      case 'AUTHENTICATION_ERROR': {
        model.status = 'DISABLED';
        model.cooldownUntil = null;
        console.error(`[ModelRegistry] ${model.id} → DISABLED (AUTH/OFFLINE: ${errorClass})`);
        break;
      }

      case 'MODEL_NOT_FOUND':
      case 'UNSUPPORTED_MODEL':
      case 'INVALID_REQUEST': {
        model.status = 'DISABLED';
        model.cooldownUntil = null;
        console.error(`[ModelRegistry] ${model.id} → DISABLED (Permanent: ${errorClass})`);
        break;
      }

      // ── Temporary ───────────────────────────────────────────────────
      case 'RATE_LIMITED': {
        model.status = 'RATE_LIMITED';
        const retryDelay = this.extractRetryDelay(error) || RATE_LIMIT_COOLDOWN_MS;
        model.cooldownUntil = now + retryDelay;
        console.warn(`[ModelRegistry] ${model.id} → RATE_LIMITED. Cooldown until ${new Date(model.cooldownUntil).toISOString()}`);
        break;
      }

      case 'NETWORK_ERROR': {
        model.status = 'COOLDOWN';
        model.cooldownUntil = now + Math.floor(HEALTH_RECHECK_MS / 2);
        console.warn(`[ModelRegistry] ${model.id} → NETWORK_ERROR. Cooldown ${Math.floor(HEALTH_RECHECK_MS / 2)}ms`);
        break;
      }

      case 'TIMEOUT': {
        model.consecutiveTimeouts++;
        model.timeoutCount++;
        model.lastTimeoutAt = now;
        // Exponential backoff: base * 2^(n-1), capped at max
        const backoffMs = Math.min(
          TIMEOUT_COOLDOWN_BASE_MS * Math.pow(2, model.consecutiveTimeouts - 1),
          TIMEOUT_COOLDOWN_MAX_MS
        );
        model.status = 'DEGRADED';
        model.cooldownUntil = now + backoffMs;
        // Penalise latency score
        const timeoutCostMs = model.timeoutMs || 15000;
        model.averageLatencyMs =
          model.averageLatencyMs === 0
            ? timeoutCostMs
            : (model.averageLatencyMs * 0.6) + (timeoutCostMs * 0.4);
        console.warn(
          `[ModelRegistry] ${model.id} → DEGRADED/TIMEOUT ` +
          `(consecutive: ${model.consecutiveTimeouts}, backoff: ${backoffMs}ms)`
        );
        break;
      }

      case 'INVALID_RESPONSE':
      case 'SCHEMA_ERROR': {
        model.invalidResponseCount++;
        if (model.invalidResponseCount >= 2) {
          model.status = 'DEGRADED';
          model.cooldownUntil = now + HEALTH_RECHECK_MS;
          console.warn(`[ModelRegistry] ${model.id} → DEGRADED (repeated INVALID_RESPONSE: ${model.invalidResponseCount})`);
        } else {
          console.warn(`[ModelRegistry] ${model.id} → INVALID_RESPONSE #${model.invalidResponseCount} (still eligible for retry)`);
        }
        break;
      }

      case 'PROVIDER_ERROR':
      case 'TRANSIENT':
      case 'UNKNOWN':
      default: {
        if (model.consecutiveFailures >= 3) {
          model.status = 'COOLDOWN';
          model.cooldownUntil = now + HEALTH_RECHECK_MS;
          console.warn(`[ModelRegistry] ${model.id} → COOLDOWN after ${model.consecutiveFailures} failures`);
        }
        break;
      }
    }

    return errorClass;
  }

  /**
   * Score a model for selection. Higher = better.
   * DEGRADED / PROBING models get a 60% score haircut — last resort only.
   */
  public score(model: ModelRegistryEntry): number {
    const successRate =
      model.totalRequests > 0 ? model.successfulRequests / model.totalRequests : 1.0;

    const avgLatency  = model.averageLatencyMs > 0 ? model.averageLatencyMs : 3000;
    const latencyScore      = Math.max(0, 1 - avgLatency / 30000);
    const reliabilityScore  = successRate;
    const priorityScore     = Math.max(0, 1 - (model.priority - 1) * 0.1);
    const failurePenalty    = Math.max(0, 1 - model.consecutiveFailures * 0.2);
    const timeoutPenalty    = Math.max(0, 1 - model.consecutiveTimeouts  * 0.25);
    const invalidRespPenalty= Math.max(0, 1 - model.invalidResponseCount  * 0.2);

    let loadScore = 1.0;
    if (model.maxConcurrentRequests > 0) {
      if (model.activeRequests >= model.maxConcurrentRequests) {
        loadScore = 0.05; // near-zero — at capacity
      } else {
        loadScore = 1 - (model.activeRequests / model.maxConcurrentRequests) * 0.5;
      }
    }

    let base =
      reliabilityScore   * 0.25 +
      latencyScore       * 0.20 +
      priorityScore      * 0.20 +
      loadScore          * 0.15 +
      failurePenalty     * 0.10 +
      timeoutPenalty     * 0.05 +
      invalidRespPenalty * 0.05;

    // Heavy score haircut for degraded/probing — prefer healthy alternatives
    if (model.status === 'DEGRADED' || model.status === 'PROBING' || model.status === 'SLOW') {
      base *= 0.4;
    }

    return base;
  }

  /** Full status snapshot for monitoring/UI. */
  public getStatus() {
    return Array.from(this.models.values()).map(m => ({
      id: m.id,
      provider: m.provider,
      modelName: m.modelName,
      role: m.role,
      status: m.status,
      successRate: m.totalRequests > 0
        ? `${((m.successfulRequests / m.totalRequests) * 100).toFixed(1)}%`
        : 'N/A',
      avgLatencyMs: m.averageLatencyMs > 0 ? Math.round(m.averageLatencyMs) : 0,
      cooldownUntil: m.cooldownUntil,
      quotaResetAt: m.quotaResetAt,
      consecutiveFailures: m.consecutiveFailures,
      consecutiveTimeouts: m.consecutiveTimeouts,
      invalidResponseCount: m.invalidResponseCount,
      totalRequests: m.totalRequests,
    }));
  }

  // ─── Error Classification ────────────────────────────────────────────────────

  public classifyError(error: any): ErrorClass {
    // Priority 1: named error classes thrown by providers
    const name = (error?.name || '');
    if (name === 'TimeoutError')          return 'TIMEOUT';
    if (name === 'InvalidResponseError')  return 'INVALID_RESPONSE';
    if (name === 'NetworkError')          return 'NETWORK_ERROR';

    // Priority 2: HTTP status codes (most precise signal)
    const status = error?.statusCode || error?.status || 0;
    if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR';
    if (status === 404)                   return 'MODEL_NOT_FOUND';
    if (status === 429) {
      const msg = (error?.message || '').toLowerCase();
      if (
        msg.includes('daily') || msg.includes('quota') ||
        msg.includes('generaterequestsperdayperproject') ||
        msg.includes('free_tier') || msg.includes('exhausted')
      ) return 'QUOTA_EXHAUSTED';
      return 'RATE_LIMITED';
    }
    if (status >= 500) return 'PROVIDER_ERROR';

    // Priority 3: message-based fallback
    const msg = (error?.message || '').toLowerCase();

    if (
      msg.includes('daily_quota_exhausted') ||
      msg.includes('generaterequestsperdayperproject') ||
      msg.includes('free_tier') ||
      (msg.includes('quota') && (msg.includes('day') || msg.includes('exhausted')))
    ) return 'QUOTA_EXHAUSTED';

    if (
      msg.includes('rate_limited') || msg.includes('rate limit') ||
      msg.includes('too many requests') || msg.includes('429')
    ) return 'RATE_LIMITED';

    if (
      msg.includes('offline') || msg.includes('not configured') ||
      msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')
    ) return 'AUTHENTICATION_ERROR';

    if (
      msg.includes('model not found') || msg.includes('does not exist') ||
      msg.includes('invalid model')   || msg.includes('unsupported model') ||
      msg.includes('decommissioned')  || msg.includes('404')
    ) return 'MODEL_NOT_FOUND';

    if (
      msg.includes('invalid parameter') || msg.includes('invalid request') ||
      msg.includes('bad request')
    ) return 'INVALID_REQUEST';

    if (
      msg.includes('fetch failed')  || msg.includes('network error') ||
      msg.includes('econnrefused')  || msg.includes('econnreset') ||
      msg.includes('socket hang up')
    ) return 'NETWORK_ERROR';

    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
      return 'TIMEOUT';
    }

    if (
      msg.includes('invalid_response') || msg.includes('invalid response') ||
      msg.includes('non-json') || msg.includes('user safety') ||
      msg.includes('safety message') || msg.includes('unexpected token') ||
      msg.includes('not valid json') || msg.includes('schema')
    ) return 'INVALID_RESPONSE';

    if (msg.includes('service unavailable') || /\b5[0-9]{2}\b/.test(msg)) return 'PROVIDER_ERROR';

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
