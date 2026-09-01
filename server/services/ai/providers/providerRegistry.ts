/**
 * ProviderRegistry — Phase 20.2 update
 *
 * Initializes all configured AI providers and registers each model
 * as an independent entry in ModelRegistry for per-model health tracking.
 */

import { AIProvider } from './provider.interface';
import { GeminiProvider } from './geminiProvider';
import { GroqProvider } from './groqProvider';
import { OpenRouterProvider } from './openRouterProvider';
import { HuggingFaceProvider } from './huggingFaceProvider';
import { ModelRegistry, ModelRegistryEntry } from '../modelRegistry';
import { DynamicModelRouter } from '../dynamicModelRouter';

export type AIRole =
  | 'INDEPENDENT MARKET ANALYST'
  | 'TECHNICAL ANALYST'
  | 'PRICE ACTION ANALYST'
  | 'MOMENTUM ANALYST'
  | 'RISK CHALLENGER';

export interface ProviderRegistration {
  provider: AIProvider;
  role: AIRole;
  priority: number;
}

export class ProviderRegistry {
  private static providers: ProviderRegistration[] = [];
  private static initialized = false;

  public static initialize() {
    if (this.initialized) return;

    this.providers = [];

    const defaultCapabilities = {
      structuredOutput: true, json: true, reasoning: true,
      technicalAnalysis: true, riskAnalysis: true
    };
    const maxParallelPerModel  = parseInt(process.env.AI_MAX_PARALLEL_REQUESTS_PER_MODEL || '1');
    const geminiMaxConcurrent  = parseInt(process.env.AI_GEMINI_MAX_CONCURRENT           || '1');
    const geminiTimeoutMs      = parseInt(process.env.AI_GEMINI_TIMEOUT_MS               || '20000');
    const groqTimeoutMs        = parseInt(process.env.AI_GROQ_TIMEOUT_MS                 || '10000');
    const orTimeoutMs          = parseInt(process.env.AI_OPENROUTER_TIMEOUT_MS           || '20000');
    const hfTimeoutMs          = parseInt(process.env.AI_HUGGINGFACE_TIMEOUT_MS          || '20000');
    const defaultTimeoutMs     = parseInt(process.env.AI_PROVIDER_TIMEOUT_MS             || '15000');

    // ── Gemini ─────────────────────────────────────────────────────────────────
    const gemini = new GeminiProvider();
    const geminiPriority = parseInt(process.env.GEMINI_PRIORITY || '1');
    if (gemini.isConfigured()) {
      this.providers.push({ provider: gemini, role: 'INDEPENDENT MARKET ANALYST', priority: geminiPriority });
      this.registerModel({
        id: `gemini:${process.env.GEMINI_MODEL || 'gemini-3.6-flash'}`,
        provider: 'gemini', modelName: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        providerInstance: gemini, role: 'INDEPENDENT MARKET ANALYST',
        priority: geminiPriority, status: 'CONFIGURED',
        capabilities: { ...defaultCapabilities },
        activeRequests: 0, maxConcurrentRequests: geminiMaxConcurrent,
        timeoutMs: geminiTimeoutMs,
        cooldownUntil: null, quotaResetAt: null,
        consecutiveFailures: 0, consecutiveTimeouts: 0, timeoutCount: 0,
        invalidResponseCount: 0,
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        totalLatencyMs: 0, averageLatencyMs: 0,
        lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null, lastTimeoutAt: null,
      });
    }

    // ── Groq ───────────────────────────────────────────────────────────────────
    const groq = new GroqProvider();
    const groqPriority = parseInt(process.env.GROQ_PRIORITY || '2');
    if (groq.isConfigured()) {
      let groqStatus: ModelStatus = 'CONFIGURED';
      const groqModel = process.env.GROQ_MODEL || 'llama3-70b-8192';
      if (groqModel === 'llama3-70b-8192') {
         console.warn(`[ProviderRegistry] WARNING: Groq model ${groqModel} is invalid/decommissioned.`);
         groqStatus = 'DISABLED';
      }

      this.providers.push({ provider: groq, role: 'TECHNICAL ANALYST', priority: groqPriority });
      this.registerModel({
        id: `groq:${groqModel}`,
        provider: 'groq', modelName: groqModel,
        providerInstance: groq, role: 'TECHNICAL ANALYST',
        priority: groqPriority, status: groqStatus,
        capabilities: { ...defaultCapabilities },
        activeRequests: 0, maxConcurrentRequests: maxParallelPerModel,
        timeoutMs: groqTimeoutMs,
        cooldownUntil: null, quotaResetAt: null,
        consecutiveFailures: 0, consecutiveTimeouts: 0, timeoutCount: 0,
        invalidResponseCount: 0,
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        totalLatencyMs: 0, averageLatencyMs: 0,
        lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null, lastTimeoutAt: null,
      });
    }

    // ── HuggingFace ────────────────────────────────────────────────────────────
    const hf = new HuggingFaceProvider();
    const hfPriority = parseInt(process.env.HUGGINGFACE_PRIORITY || '4');
    if (hf.isConfigured()) {
      this.providers.push({ provider: hf, role: 'MOMENTUM ANALYST', priority: hfPriority });
      this.registerModel({
        id: `huggingface:${process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct'}`,
        provider: 'huggingface', modelName: process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct',
        providerInstance: hf, role: 'MOMENTUM ANALYST',
        priority: hfPriority, status: 'CONFIGURED',
        capabilities: { ...defaultCapabilities },
        activeRequests: 0, maxConcurrentRequests: maxParallelPerModel,
        timeoutMs: hfTimeoutMs,
        cooldownUntil: null, quotaResetAt: null,
        consecutiveFailures: 0, consecutiveTimeouts: 0, timeoutCount: 0,
        invalidResponseCount: 0,
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        totalLatencyMs: 0, averageLatencyMs: 0,
        lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null, lastTimeoutAt: null,
      });
    }

    // ── OpenRouter — each model is its own independent entry ──────────────────
    const orModels = (process.env.OPENROUTER_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    const orPriorityBase = parseInt(process.env.OPENROUTER_PRIORITY || '3');
    const orRoles: AIRole[] = ['PRICE ACTION ANALYST', 'RISK CHALLENGER'];

    orModels.forEach((modelId, idx) => {
      const provider = new OpenRouterProvider(modelId);
      if (provider.isConfigured()) {
        const role = orRoles[idx] || 'PRICE ACTION ANALYST';
        const priority = orPriorityBase + idx;
        this.providers.push({ provider, role, priority });
        this.registerModel({
          id: `openrouter:${modelId}`,
          provider: 'openrouter', modelName: modelId,
          providerInstance: provider, role, priority, status: 'CONFIGURED',
          capabilities: { ...defaultCapabilities },
          activeRequests: 0, maxConcurrentRequests: maxParallelPerModel,
          timeoutMs: orTimeoutMs,
          cooldownUntil: null, quotaResetAt: null,
          consecutiveFailures: 0, consecutiveTimeouts: 0, timeoutCount: 0,
          invalidResponseCount: 0,
          totalRequests: 0, successfulRequests: 0, failedRequests: 0,
          totalLatencyMs: 0, averageLatencyMs: 0,
          lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null, lastTimeoutAt: null,
        });
      }
    });

    this.initialized = true;
    const all      = ModelRegistry.getAll();
    const eligible = ModelRegistry.getEligible();
    const disabled = all.filter(m => m.status === 'DISABLED');
    console.log(
      `[ProviderRegistry] Initialized | Registered: ${all.length} models | ` +
      `Eligible: ${eligible.length} | Disabled: ${disabled.length}`
    );
    if (disabled.length > 0) {
      console.warn(`[ProviderRegistry] Disabled at startup: ${disabled.map(m => m.id).join(', ')}`);
    }
    console.log(`[ProviderRegistry] Eligible: ${eligible.map(m => `${m.id}(${m.status})`).join(', ')}`);
  }

  private static registerModel(entry: ModelRegistryEntry): void {
    ModelRegistry.register(entry);
  }

  /** Get all eligible providers (legacy compat for monitoring service) */
  public static getEligibleProviders(): ProviderRegistration[] {
    if (!this.initialized) this.initialize();
    return this.providers.filter(p => {
      const health = p.provider.getHealth();
      return health.status === 'HEALTHY' || health.status === 'DEGRADED';
    }).sort((a, b) => a.priority - b.priority);
  }

  /** Returns false whenever multiple healthy models exist */
  public static isGeminiOnly(): boolean {
    if (!this.initialized) this.initialize();
    const eligible = ModelRegistry.getEligible();
    if (eligible.length <= 1) return true;
    // Check if the only eligible model is Gemini
    return eligible.every(m => m.provider === 'gemini');
  }

  /** Per-model health for health API and UI */
  public static getProviderHealths() {
    if (!this.initialized) this.initialize();
    return this.providers.map(p => ({
      name: p.provider.name,
      role: p.role,
      health: p.provider.getHealth()
    }));
  }

  /** Full model-level status for Phase 20.2 UI */
  public static getRouterStatus() {
    if (!this.initialized) this.initialize();
    return DynamicModelRouter.getRouterStatus();
  }
}
