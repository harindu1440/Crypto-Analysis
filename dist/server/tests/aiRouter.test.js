"use strict";
/**
 * aiRouter.test.ts — Phase 20.2
 * Tests all DynamicModelRouter failover scenarios.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const modelRegistry_1 = require("../services/ai/modelRegistry");
const dynamicModelRouter_1 = require("../services/ai/dynamicModelRouter");
// ─── Test Helpers ─────────────────────────────────────────────────────────────
function makeProvider(name, responseFactory) {
    return {
        name,
        isConfigured: () => true,
        getHealth: () => ({ status: 'HEALTHY', consecutiveFailures: 0, rateLimitCount: 0, lastFailure: null, cooldownUntil: null }),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        generateObject: jest.fn().mockImplementation(responseFactory),
    };
}
function makeEntry(id, provider, priority, providerInstance, status = 'AVAILABLE') {
    return {
        id,
        provider,
        modelName: `${provider}-model`,
        providerInstance,
        role: 'INDEPENDENT MARKET ANALYST',
        priority,
        status,
        cooldownUntil: null,
        quotaResetAt: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatencyMs: 0,
        lastUsedAt: null,
        lastFailureAt: null,
        lastSuccessAt: null,
    };
}
// Clear and re-register models before each test
function resetRegistry(...entries) {
    // Reach into the private map via any-cast
    modelRegistry_1.ModelRegistry.models = new Map();
    entries.forEach(e => modelRegistry_1.ModelRegistry.register(e));
}
// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Phase 20.2: DynamicModelRouter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    // ── 1. QUOTA EXHAUSTED → Failover to Groq ──────────────────────────────────
    it('Gemini quota exhausted → auto-switch to Groq', async () => {
        const geminiProvider = makeProvider('gemini', async () => {
            throw new Error('GenerateRequestsPerDayPerProjectFreeTier quota exceeded');
        });
        const groqProvider = makeProvider('groq', async () => ({ decision: 'NO_TRADE', confidence: 60 }));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, geminiProvider), makeEntry('groq:llama', 'groq', 2, groqProvider));
        const result = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:BTCUSDT');
        expect(result.modelId).toBe('groq:llama');
        expect(result.data).toMatchObject({ decision: 'NO_TRADE' });
        expect(result.failoverCount).toBe(1);
        const geminiEntry = modelRegistry_1.ModelRegistry.get('gemini:flash');
        expect(geminiEntry?.status).toBe('QUOTA_EXHAUSTED');
    });
    // ── 2. RATE_LIMITED → Cooldown → Next Model ────────────────────────────────
    it('Rate limit 429 → model enters RATE_LIMITED → next model selected', async () => {
        const geminiProvider = makeProvider('gemini', async () => {
            throw new Error('429 rate limit retryDelay: 15s');
        });
        const openRouterProvider = makeProvider('openrouter', async () => ({ passScreening: true }));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, geminiProvider), makeEntry('openrouter:mistral', 'openrouter', 3, openRouterProvider));
        const result = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:ETHUSDT');
        expect(result.modelId).toBe('openrouter:mistral');
        expect(result.failoverCount).toBe(1);
        const geminiEntry = modelRegistry_1.ModelRegistry.get('gemini:flash');
        expect(geminiEntry?.status).toBe('RATE_LIMITED');
        expect(geminiEntry?.cooldownUntil).toBeGreaterThan(Date.now());
    });
    // ── 3. MULTIPLE FAILURES: Gemini fails → Groq fails → OpenRouter succeeds ──
    it('Multiple failures: Gemini→Groq→OpenRouter succeeds', async () => {
        const gemini = makeProvider('gemini', async () => { throw new Error('DAILY_QUOTA_EXHAUSTED'); });
        const groq = makeProvider('groq', async () => { throw new Error('Groq API Error: 503'); });
        const openRouter = makeProvider('openrouter', async () => ({ decision: 'CANDIDATE_TRADE', confidence: 75 }));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, gemini), makeEntry('groq:llama', 'groq', 2, groq), makeEntry('openrouter:free', 'openrouter', 3, openRouter));
        const result = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'MasterDecision', undefined, 'Test:SOLUSDT');
        expect(result.modelId).toBe('openrouter:free');
        expect(result.data.decision).toBe('CANDIDATE_TRADE');
        expect(result.failoverCount).toBe(2);
    });
    // ── 4. OpenRouter Model Rotation: A fails → B succeeds ─────────────────────
    it('OpenRouter model A fails → model B selected', async () => {
        const orModelA = makeProvider('openrouter-a', async () => { throw new Error('OpenRouter API Error: 429'); });
        const orModelB = makeProvider('openrouter-b', async () => ({ passScreening: true }));
        resetRegistry(makeEntry('openrouter:model-a', 'openrouter', 3, orModelA), makeEntry('openrouter:model-b', 'openrouter', 4, orModelB));
        const result = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:TRXUSDT');
        expect(result.modelId).toBe('openrouter:model-b');
        expect(result.failoverCount).toBe(1);
        // Model A should be rate limited, B still available
        expect(modelRegistry_1.ModelRegistry.get('openrouter:model-a')?.status).toBe('RATE_LIMITED');
        expect(modelRegistry_1.ModelRegistry.get('openrouter:model-b')?.status).toBe('AVAILABLE');
    });
    // ── 5. ALL FAIL → AIUnavailableError ───────────────────────────────────────
    it('All models fail → AIUnavailableError thrown', async () => {
        const fail = (name) => makeProvider(name, async () => { throw new Error('DAILY_QUOTA_EXHAUSTED'); });
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, fail('gemini')), makeEntry('groq:llama', 'groq', 2, fail('groq')), makeEntry('openrouter:free', 'openrouter', 3, fail('openrouter')), makeEntry('hf:llama', 'huggingface', 4, fail('hf')));
        await expect(dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:DOGEUSDT')).rejects.toThrow(dynamicModelRouter_1.AIUnavailableError);
        // All models should be marked QUOTA_EXHAUSTED
        ['gemini:flash', 'groq:llama', 'openrouter:free', 'hf:llama'].forEach(id => {
            expect(modelRegistry_1.ModelRegistry.get(id)?.status).toBe('QUOTA_EXHAUSTED');
        });
    });
    // ── 6. Model Recovery after cooldown ───────────────────────────────────────
    it('Model recovers after cooldown expires', () => {
        const provider = makeProvider('groq', async () => ({ ok: true }));
        const entry = makeEntry('groq:llama', 'groq', 2, provider, 'RATE_LIMITED');
        entry.cooldownUntil = Date.now() - 1000; // expired 1 second ago
        resetRegistry(entry);
        const eligible = modelRegistry_1.ModelRegistry.getEligible();
        expect(eligible.length).toBe(1);
        expect(eligible[0].id).toBe('groq:llama');
        expect(eligible[0].status).toBe('AVAILABLE'); // auto-recovered
    });
    // ── 7. Best Model Selection: highest scoring wins ──────────────────────────
    it('Highest-scoring model selected from multiple eligible', async () => {
        const highLatency = makeProvider('high-latency', async () => ({ ok: true }));
        const lowLatency = makeProvider('low-latency', async () => ({ ok: true }));
        const entryA = makeEntry('gemini:flash', 'gemini', 1, highLatency);
        entryA.totalRequests = 10;
        entryA.successfulRequests = 5;
        entryA.totalLatencyMs = 100000; // 10s avg
        const entryB = makeEntry('groq:llama', 'groq', 2, lowLatency);
        entryB.totalRequests = 10;
        entryB.successfulRequests = 9;
        entryB.totalLatencyMs = 10000; // 1s avg
        resetRegistry(entryA, entryB);
        // Groq has higher reliability and lower latency — should score higher despite lower priority
        const scoreA = modelRegistry_1.ModelRegistry.score(entryA);
        const scoreB = modelRegistry_1.ModelRegistry.score(entryB);
        expect(scoreB).toBeGreaterThan(scoreA);
    });
    // ── 8. No duplicate retries in same request ─────────────────────────────────
    it('Failed model is never retried within the same request', async () => {
        let geminiCallCount = 0;
        const gemini = makeProvider('gemini', async () => {
            geminiCallCount++;
            throw new Error('DAILY_QUOTA_EXHAUSTED');
        });
        const groq = makeProvider('groq', async () => ({ ok: true }));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, gemini), makeEntry('groq:llama', 'groq', 2, groq));
        const result = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:BNBUSDT');
        // Gemini called exactly once, Groq used for result
        expect(geminiCallCount).toBe(1);
        expect(result.modelId).toBe('groq:llama');
    });
    // ── 9. Error Classification ─────────────────────────────────────────────────
    it('correctly classifies error types', () => {
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('GenerateRequestsPerDayPerProjectFreeTier exceeded'))).toBe('QUOTA_EXHAUSTED');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('DAILY_QUOTA_EXHAUSTED'))).toBe('QUOTA_EXHAUSTED');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('429 too many requests'))).toBe('RATE_LIMITED');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('rate limit exceeded'))).toBe('RATE_LIMITED');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('Groq API is OFFLINE'))).toBe('OFFLINE');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('401 Unauthorized'))).toBe('OFFLINE');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('503 Service Unavailable'))).toBe('TRANSIENT');
        expect(modelRegistry_1.ModelRegistry.classifyError(new Error('timeout'))).toBe('TRANSIENT');
    });
    // ── 10. Disabled model never selected ──────────────────────────────────────
    it('DISABLED models are never selected', () => {
        const p = makeProvider('gemini', async () => ({ ok: true }));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, p, 'DISABLED'));
        expect(modelRegistry_1.ModelRegistry.getEligible().length).toBe(0);
    });
    // ── 11. getRouterStatus returns correct active model ───────────────────────
    it('getRouterStatus returns the best eligible model', () => {
        const p1 = makeProvider('gemini', async () => ({}));
        const p2 = makeProvider('groq', async () => ({}));
        resetRegistry(makeEntry('gemini:flash', 'gemini', 1, p1, 'QUOTA_EXHAUSTED'), makeEntry('groq:llama', 'groq', 2, p2, 'AVAILABLE'));
        // Mark quota exhausted model's quotaResetAt in the future so it won't recover
        const geminiEntry = modelRegistry_1.ModelRegistry.get('gemini:flash');
        geminiEntry.quotaResetAt = Date.now() + 900000;
        const status = dynamicModelRouter_1.DynamicModelRouter.getRouterStatus();
        expect(status.activeModel?.id).toBe('groq:llama');
        expect(status.eligibleCount).toBe(1);
        expect(status.totalModels).toBe(2);
    });
});
