"use strict";
/**
 * ProviderRegistry — Phase 20.2 update
 *
 * Initializes all configured AI providers and registers each model
 * as an independent entry in ModelRegistry for per-model health tracking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
const geminiProvider_1 = require("./geminiProvider");
const groqProvider_1 = require("./groqProvider");
const openRouterProvider_1 = require("./openRouterProvider");
const huggingFaceProvider_1 = require("./huggingFaceProvider");
const modelRegistry_1 = require("../modelRegistry");
const dynamicModelRouter_1 = require("../dynamicModelRouter");
class ProviderRegistry {
    static providers = [];
    static initialized = false;
    static initialize() {
        if (this.initialized)
            return;
        this.providers = [];
        // ── Gemini ─────────────────────────────────────────────────────────────────
        const gemini = new geminiProvider_1.GeminiProvider();
        const geminiPriority = parseInt(process.env.GEMINI_PRIORITY || '1');
        if (gemini.isConfigured()) {
            this.providers.push({ provider: gemini, role: 'INDEPENDENT MARKET ANALYST', priority: geminiPriority });
            this.registerModel({
                id: `gemini:${process.env.GEMINI_MODEL || 'gemini-3.6-flash'}`,
                provider: 'gemini',
                modelName: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
                providerInstance: gemini,
                role: 'INDEPENDENT MARKET ANALYST',
                priority: geminiPriority,
                status: 'AVAILABLE',
                cooldownUntil: null, quotaResetAt: null,
                consecutiveFailures: 0, totalRequests: 0, successfulRequests: 0,
                failedRequests: 0, totalLatencyMs: 0,
                lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null,
            });
        }
        // ── Groq ───────────────────────────────────────────────────────────────────
        const groq = new groqProvider_1.GroqProvider();
        const groqPriority = parseInt(process.env.GROQ_PRIORITY || '2');
        if (groq.isConfigured()) {
            this.providers.push({ provider: groq, role: 'TECHNICAL ANALYST', priority: groqPriority });
            this.registerModel({
                id: `groq:${process.env.GROQ_MODEL || 'llama3-70b-8192'}`,
                provider: 'groq',
                modelName: process.env.GROQ_MODEL || 'llama3-70b-8192',
                providerInstance: groq,
                role: 'TECHNICAL ANALYST',
                priority: groqPriority,
                status: 'AVAILABLE',
                cooldownUntil: null, quotaResetAt: null,
                consecutiveFailures: 0, totalRequests: 0, successfulRequests: 0,
                failedRequests: 0, totalLatencyMs: 0,
                lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null,
            });
        }
        // ── HuggingFace ────────────────────────────────────────────────────────────
        const hf = new huggingFaceProvider_1.HuggingFaceProvider();
        const hfPriority = parseInt(process.env.HUGGINGFACE_PRIORITY || '4');
        if (hf.isConfigured()) {
            this.providers.push({ provider: hf, role: 'MOMENTUM ANALYST', priority: hfPriority });
            this.registerModel({
                id: `huggingface:${process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct'}`,
                provider: 'huggingface',
                modelName: process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct',
                providerInstance: hf,
                role: 'MOMENTUM ANALYST',
                priority: hfPriority,
                status: 'AVAILABLE',
                cooldownUntil: null, quotaResetAt: null,
                consecutiveFailures: 0, totalRequests: 0, successfulRequests: 0,
                failedRequests: 0, totalLatencyMs: 0,
                lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null,
            });
        }
        // ── OpenRouter — each model is its own independent entry ──────────────────
        const orModels = (process.env.OPENROUTER_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
        const orPriorityBase = parseInt(process.env.OPENROUTER_PRIORITY || '3');
        const orRoles = ['PRICE ACTION ANALYST', 'RISK CHALLENGER'];
        orModels.forEach((modelId, idx) => {
            const provider = new openRouterProvider_1.OpenRouterProvider(modelId);
            if (provider.isConfigured()) {
                const role = orRoles[idx] || 'PRICE ACTION ANALYST';
                const priority = orPriorityBase + idx;
                this.providers.push({ provider, role, priority });
                this.registerModel({
                    id: `openrouter:${modelId}`,
                    provider: 'openrouter',
                    modelName: modelId,
                    providerInstance: provider,
                    role,
                    priority,
                    status: 'AVAILABLE',
                    cooldownUntil: null, quotaResetAt: null,
                    consecutiveFailures: 0, totalRequests: 0, successfulRequests: 0,
                    failedRequests: 0, totalLatencyMs: 0,
                    lastUsedAt: null, lastFailureAt: null, lastSuccessAt: null,
                });
            }
        });
        this.initialized = true;
        const count = modelRegistry_1.ModelRegistry.getAll().length;
        console.log(`[ProviderRegistry] Initialized ${this.providers.length} providers / ${count} models in registry.`);
        console.log(`[ProviderRegistry] Models: ${modelRegistry_1.ModelRegistry.getAll().map(m => `${m.id}(${m.status})`).join(', ')}`);
    }
    static registerModel(entry) {
        modelRegistry_1.ModelRegistry.register(entry);
    }
    /** Get all eligible providers (legacy compat for monitoring service) */
    static getEligibleProviders() {
        if (!this.initialized)
            this.initialize();
        return this.providers.filter(p => {
            const health = p.provider.getHealth();
            return health.status === 'HEALTHY' || health.status === 'DEGRADED';
        }).sort((a, b) => a.priority - b.priority);
    }
    /** Returns false whenever multiple healthy models exist */
    static isGeminiOnly() {
        if (!this.initialized)
            this.initialize();
        const eligible = modelRegistry_1.ModelRegistry.getEligible();
        if (eligible.length <= 1)
            return true;
        // Check if the only eligible model is Gemini
        return eligible.every(m => m.provider === 'gemini');
    }
    /** Per-model health for health API and UI */
    static getProviderHealths() {
        if (!this.initialized)
            this.initialize();
        return this.providers.map(p => ({
            name: p.provider.name,
            role: p.role,
            health: p.provider.getHealth()
        }));
    }
    /** Full model-level status for Phase 20.2 UI */
    static getRouterStatus() {
        if (!this.initialized)
            this.initialize();
        return dynamicModelRouter_1.DynamicModelRouter.getRouterStatus();
    }
}
exports.ProviderRegistry = ProviderRegistry;
