/**
 * aiRouter.test.ts — Phase 20.2
 * Tests all DynamicModelRouter failover scenarios.
 */

import { ModelRegistry, ModelRegistryEntry, ModelStatus } from '../services/ai/modelRegistry';
import { DynamicModelRouter, AIUnavailableError } from '../services/ai/dynamicModelRouter';
import { AIProvider } from '../services/ai/providers/provider.interface';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeProvider(name: string, responseFactory: () => Promise<any>): AIProvider {
  return {
    name,
    isConfigured: () => true,
    getHealth: () => ({ status: 'HEALTHY', consecutiveFailures: 0, rateLimitCount: 0, lastFailure: null, cooldownUntil: null }),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    generateObject: jest.fn().mockImplementation(responseFactory),
  };
}

function makeEntry(
  id: string,
  provider: string,
  priority: number,
  providerInstance: AIProvider,
  status: ModelStatus = 'AVAILABLE'
): ModelRegistryEntry {
  return {
    id,
    provider,
    modelName: `${provider}-model`,
    providerInstance,
    role: 'INDEPENDENT MARKET ANALYST',
    priority,
    status,
    capabilities: {
      structuredOutput: true,
      json: true,
      reasoning: true,
      technicalAnalysis: true,
      riskAnalysis: true
    },
    activeRequests: 0,
    maxConcurrentRequests: 1,
    timeoutMs: 15000,
    cooldownUntil: null,
    quotaResetAt: null,
    consecutiveFailures: 0,
    consecutiveTimeouts: 0,
    timeoutCount: 0,
    invalidResponseCount: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    lastUsedAt: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastTimeoutAt: null,
  };
}

// Clear and re-register models before each test
function resetRegistry(...entries: ModelRegistryEntry[]) {
  // Reach into the private map via any-cast
  (ModelRegistry as any).models = new Map();
  entries.forEach(e => ModelRegistry.register(e));
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

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, geminiProvider),
      makeEntry('groq:llama', 'groq', 2, groqProvider),
    );

    const result = await DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:BTCUSDT');

    expect(result.modelId).toBe('groq:llama');
    expect((result.data as any)).toMatchObject({ decision: 'NO_TRADE' });
    expect(result.failoverCount).toBe(1);

    const geminiEntry = ModelRegistry.get('gemini:flash');
    expect(geminiEntry?.status).toBe('QUOTA_EXHAUSTED');
  });

  // ── 2. RATE_LIMITED → Cooldown → Next Model ────────────────────────────────
  it('Rate limit 429 → model enters RATE_LIMITED → next model selected', async () => {
    const geminiProvider = makeProvider('gemini', async () => {
      throw new Error('429 rate limit retryDelay: 15s');
    });
    const openRouterProvider = makeProvider('openrouter', async () => ({ passScreening: true }));

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, geminiProvider),
      makeEntry('openrouter:mistral', 'openrouter', 3, openRouterProvider),
    );

    const result = await DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:ETHUSDT');

    expect(result.modelId).toBe('openrouter:mistral');
    expect(result.failoverCount).toBe(1);

    const geminiEntry = ModelRegistry.get('gemini:flash');
    expect(geminiEntry?.status).toBe('RATE_LIMITED');
    expect(geminiEntry?.cooldownUntil).toBeGreaterThan(Date.now());
  });

  // ── 3. MULTIPLE FAILURES: Gemini fails → Groq fails → OpenRouter succeeds ──
  it('Multiple failures: Gemini→Groq→OpenRouter succeeds', async () => {
    const gemini = makeProvider('gemini', async () => { throw new Error('DAILY_QUOTA_EXHAUSTED'); });
    const groq = makeProvider('groq', async () => { throw new Error('Groq API Error: 503'); });
    const openRouter = makeProvider('openrouter', async () => ({ decision: 'CANDIDATE_TRADE', confidence: 75 }));

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, gemini),
      makeEntry('groq:llama', 'groq', 2, groq),
      makeEntry('openrouter:free', 'openrouter', 3, openRouter),
    );

    const result = await DynamicModelRouter.executeWithFailover('prompt', 'MasterDecision', undefined, 'Test:SOLUSDT');

    expect(result.modelId).toBe('openrouter:free');
    expect((result.data as any).decision).toBe('CANDIDATE_TRADE');
    expect(result.failoverCount).toBe(2);
  });

  // ── 4. OpenRouter Model Rotation: A fails → B succeeds ─────────────────────
  it('OpenRouter model A fails → model B selected', async () => {
    const orModelA = makeProvider('openrouter-a', async () => { throw new Error('OpenRouter API Error: 429'); });
    const orModelB = makeProvider('openrouter-b', async () => ({ passScreening: true }));

    resetRegistry(
      makeEntry('openrouter:model-a', 'openrouter', 3, orModelA),
      makeEntry('openrouter:model-b', 'openrouter', 4, orModelB),
    );

    const result = await DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:TRXUSDT');

    expect(result.modelId).toBe('openrouter:model-b');
    expect(result.failoverCount).toBe(1);

    // Model A should be rate limited, B still available
    expect(ModelRegistry.get('openrouter:model-a')?.status).toBe('RATE_LIMITED');
    expect(ModelRegistry.get('openrouter:model-b')?.status).toBe('AVAILABLE');
  });

  // ── 5. ALL FAIL → AIUnavailableError ───────────────────────────────────────
  it('All models fail → AIUnavailableError thrown', async () => {
    const fail = (name: string) => makeProvider(name, async () => { throw new Error('DAILY_QUOTA_EXHAUSTED'); });

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, fail('gemini')),
      makeEntry('groq:llama', 'groq', 2, fail('groq')),
      makeEntry('openrouter:free', 'openrouter', 3, fail('openrouter')),
      makeEntry('hf:llama', 'huggingface', 4, fail('hf')),
    );

    await expect(
      DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:DOGEUSDT')
    ).rejects.toThrow(AIUnavailableError);

    // All models should be marked QUOTA_EXHAUSTED
    ['gemini:flash', 'groq:llama', 'openrouter:free', 'hf:llama'].forEach(id => {
      expect(ModelRegistry.get(id)?.status).toBe('QUOTA_EXHAUSTED');
    });
  });

  // ── 6. Model Recovery after cooldown ───────────────────────────────────────
  it('Model recovers after cooldown expires', () => {
    const provider = makeProvider('groq', async () => ({ ok: true }));
    const entry = makeEntry('groq:llama', 'groq', 2, provider, 'RATE_LIMITED');
    entry.cooldownUntil = Date.now() - 1000; // expired 1 second ago

    resetRegistry(entry);

    const eligible = ModelRegistry.getEligible();
    expect(eligible.length).toBe(1);
    expect(eligible[0].id).toBe('groq:llama');
    expect(eligible[0].status).toBe('PROBING'); // cooldown expired → PROBING (half-open) by design
  });

  // ── 7. Best Model Selection: highest scoring wins ──────────────────────────
  it('Highest-scoring model selected from multiple eligible', async () => {
    const highLatency = makeProvider('high-latency', async () => ({ ok: true }));
    const lowLatency = makeProvider('low-latency', async () => ({ ok: true }));

    const entryA = makeEntry('gemini:flash', 'gemini', 1, highLatency);
    entryA.totalRequests = 10; entryA.successfulRequests = 5; entryA.totalLatencyMs = 100000; // 10s avg

    const entryB = makeEntry('groq:llama', 'groq', 2, lowLatency);
    entryB.totalRequests = 10; entryB.successfulRequests = 9; entryB.totalLatencyMs = 10000; // 1s avg

    resetRegistry(entryA, entryB);

    // Groq has higher reliability and lower latency — should score higher despite lower priority
    const scoreA = ModelRegistry.score(entryA);
    const scoreB = ModelRegistry.score(entryB);
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

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, gemini),
      makeEntry('groq:llama', 'groq', 2, groq),
    );

    const result = await DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:BNBUSDT');

    // Gemini called exactly once, Groq used for result
    expect(geminiCallCount).toBe(1);
    expect(result.modelId).toBe('groq:llama');
  });

  // ── 9. Error Classification ─────────────────────────────────────────────────
  it('correctly classifies error types', () => {
    expect(ModelRegistry.classifyError(new Error('GenerateRequestsPerDayPerProjectFreeTier exceeded'))).toBe('QUOTA_EXHAUSTED');
    expect(ModelRegistry.classifyError(new Error('DAILY_QUOTA_EXHAUSTED'))).toBe('QUOTA_EXHAUSTED');
    expect(ModelRegistry.classifyError(new Error('429 too many requests'))).toBe('RATE_LIMITED');
    expect(ModelRegistry.classifyError(new Error('rate limit exceeded'))).toBe('RATE_LIMITED');
    expect(ModelRegistry.classifyError(new Error('Groq API is OFFLINE'))).toBe('AUTHENTICATION_ERROR');
    expect(ModelRegistry.classifyError(new Error('401 Unauthorized'))).toBe('AUTHENTICATION_ERROR');
    expect(ModelRegistry.classifyError(new Error('503 Service Unavailable'))).toBe('PROVIDER_ERROR');
    expect(ModelRegistry.classifyError(new Error('timeout'))).toBe('TIMEOUT');
  });

  // ── 10. Disabled model never selected ──────────────────────────────────────
  it('DISABLED models are never selected', () => {
    const p = makeProvider('gemini', async () => ({ ok: true }));
    resetRegistry(makeEntry('gemini:flash', 'gemini', 1, p, 'DISABLED'));
    expect(ModelRegistry.getEligible().length).toBe(0);
  });

  // ── 11. getRouterStatus returns correct active model ───────────────────────
  it('getRouterStatus returns the best eligible model', () => {
    const p1 = makeProvider('gemini', async () => ({}));
    const p2 = makeProvider('groq', async () => ({}));

    resetRegistry(
      makeEntry('gemini:flash', 'gemini', 1, p1, 'QUOTA_EXHAUSTED'),
      makeEntry('groq:llama', 'groq', 2, p2, 'AVAILABLE'),
    );

    // Mark quota exhausted model's quotaResetAt in the future so it won't recover
    const geminiEntry = ModelRegistry.get('gemini:flash')!;
    geminiEntry.quotaResetAt = Date.now() + 900000;

    const status = DynamicModelRouter.getRouterStatus();
    expect(status.activeModel?.id).toBe('groq:llama');
    expect(status.eligibleCount).toBe(1);
    expect(status.totalModels).toBe(2);
  });

  // ── 12. Model Load Balancing & Atomic Reservation ────────────────────────────
  it('prevents same model from being selected when maxConcurrent is reached', () => {
    const gemini = makeProvider('gemini', async () => ({}));
    const groq = makeProvider('groq', async () => ({}));

    const geminiEntry = makeEntry('gemini:flash', 'gemini', 1, gemini);
    geminiEntry.maxConcurrentRequests = 1;
    
    const groqEntry = makeEntry('groq:llama', 'groq', 2, groq);
    groqEntry.maxConcurrentRequests = 1;

    resetRegistry(geminiEntry, groqEntry);

    // First request should reserve Gemini
    const firstSelected = DynamicModelRouter.selectAndReserveModel([]);
    expect(firstSelected.id).toBe('gemini:flash');
    expect(firstSelected.activeRequests).toBe(1);

    // Second request should reserve Groq (since Gemini is at max capacity, its load score penalizes it)
    const secondSelected = DynamicModelRouter.selectAndReserveModel([]);
    expect(secondSelected.id).toBe('groq:llama');
    expect(secondSelected.activeRequests).toBe(1);

    // Release both
    DynamicModelRouter.releaseModel('gemini:flash');
    DynamicModelRouter.releaseModel('groq:llama');
    
    expect(geminiEntry.activeRequests).toBe(0);
  });

  // ── 13. Capability Filtering ────────────────────────────────────────────────
  it('filters models by required capabilities', () => {
    const groq = makeProvider('groq', async () => ({}));
    const openRouter = makeProvider('openrouter', async () => ({}));

    const groqEntry = makeEntry('groq:llama', 'groq', 1, groq);
    groqEntry.capabilities.riskAnalysis = false; // Groq cannot do risk
    
    const orEntry = makeEntry('openrouter:mistral', 'openrouter', 2, openRouter);
    orEntry.capabilities.riskAnalysis = true;

    resetRegistry(groqEntry, orEntry);

    // With no capabilities required, Groq wins due to priority
    const generalSelected = DynamicModelRouter.selectAndReserveModel([]);
    expect(generalSelected.id).toBe('groq:llama');
    DynamicModelRouter.releaseModel('groq:llama');

    // With riskAnalysis required, OpenRouter wins
    const riskSelected = DynamicModelRouter.selectAndReserveModel([], { riskAnalysis: true });
    expect(riskSelected.id).toBe('openrouter:mistral');
    DynamicModelRouter.releaseModel('openrouter:mistral');
  });

  // ── 14. 400 Bad Request triggers INVALID_REQUEST ────────────────────────────
  it('HTTP 400 with invalid model is classified as MODEL_NOT_FOUND', () => {
    const errorCls = ModelRegistry.classifyError(new Error('Groq API Error: 400 Bad Request - model not found'));
    expect(errorCls).toBe('MODEL_NOT_FOUND');
    
    const invalidParam = ModelRegistry.classifyError(new Error('Groq API Error: 400 Bad Request - invalid parameter'));
    expect(invalidParam).toBe('INVALID_REQUEST');
  });

  // ── 15. Network Error ───────────────────────────────────────────────────────
  it('fetch failed is classified as NETWORK_ERROR and triggers fast COOLDOWN', () => {
    const errorCls = ModelRegistry.classifyError(new Error('fetch failed'));
    expect(errorCls).toBe('NETWORK_ERROR');
    
    // Simulate updating registry
    const provider = makeProvider('hf', async () => ({}));
    const entry = makeEntry('hf:llama', 'huggingface', 4, provider);
    resetRegistry(entry);
    
    // The router would normally call this:
    ModelRegistry.recordFailure('hf:llama', new Error('fetch failed'));
    expect(entry.status).toBe('COOLDOWN');
    // Network cooldown is half of normal, so < 60000ms
    expect(entry.cooldownUntil).toBeLessThanOrEqual(Date.now() + 30000);
  });

  // ── 16. Timeout Error ───────────────────────────────────────────────────────
  it('timeout error is classified as TIMEOUT and penalizes latency', () => {
    const errorCls = ModelRegistry.classifyError(new Error('request timeout after 15000ms'));
    expect(errorCls).toBe('TIMEOUT');
    
    const provider = makeProvider('or', async () => ({}));
    const entry = makeEntry('or:free', 'openrouter', 4, provider);
    resetRegistry(entry);
    
    ModelRegistry.recordFailure('or:free', new Error('request timeout after 15000ms'));
    expect(entry.timeoutCount).toBe(1);
    expect(entry.averageLatencyMs).toBeGreaterThan(0);
    
    // Hit timeout multiple times to degrade to DEGRADED (Phase 20.4 replaces SLOW with DEGRADED)
    ModelRegistry.recordFailure('or:free', new Error('request timeout after 15000ms'));
    ModelRegistry.recordFailure('or:free', new Error('request timeout after 15000ms'));
    expect(entry.status).toBe('DEGRADED');
  });

  // ── 17. Fallback Diversification & Concentration ──────────────────────────────
  it('distributes fallback requests when using same analysisRequestId', () => {
    const gemini = makeProvider('gemini', async () => ({}));
    const groq = makeProvider('groq', async () => ({}));
    const orA = makeProvider('orA', async () => ({}));
    const orB = makeProvider('orB', async () => ({}));

    // Give them all enough capacity
    const geminiEntry = makeEntry('gemini', 'gemini', 1, gemini); geminiEntry.maxConcurrentRequests = 5;
    const groqEntry = makeEntry('groq', 'groq', 2, groq); groqEntry.maxConcurrentRequests = 5;
    const orAEntry = makeEntry('orA', 'openrouter', 3, orA); orAEntry.maxConcurrentRequests = 5;
    const orBEntry = makeEntry('orB', 'openrouter', 4, orB); orBEntry.maxConcurrentRequests = 5;
    
    resetRegistry(geminiEntry, groqEntry, orAEntry, orBEntry);

    const context = { analysisRequestId: 'test-123', expectedTotalRoles: 4 };

    // Request 1
    const r1 = DynamicModelRouter.selectAndReserveModel([], undefined, context);
    expect(r1.id).toBe('gemini'); // Highest priority

    // Request 2
    const r2 = DynamicModelRouter.selectAndReserveModel([], undefined, context);
    
    // Request 3
    const r3 = DynamicModelRouter.selectAndReserveModel([], undefined, context);
    
    // Request 4
    const r4 = DynamicModelRouter.selectAndReserveModel([], undefined, context);

    // Because of load penalty and concentration penalty, the reservations should be distributed
    const ids = [r1.id, r2.id, r3.id, r4.id];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBeGreaterThan(1);
    
    // Release them
    ids.forEach(id => DynamicModelRouter.releaseModel(id, context.analysisRequestId));
  });

  // ── 18. Gemini timeout → DEGRADED with exponential backoff ─────────────────
  it('Timeout → DEGRADED with exponential backoff (30s, 60s, 120s)', () => {
    const provider = makeProvider('gemini', async () => ({}));
    const entry = makeEntry('gemini:flash', 'gemini', 1, provider);
    entry.timeoutMs = 20000;
    resetRegistry(entry);

    // 1st timeout: backoff = 30000 * 2^0 = 30000ms
    ModelRegistry.recordFailure('gemini:flash', new Error('gemini:flash timed out after 20000ms'));
    expect(entry.status).toBe('DEGRADED');
    expect(entry.consecutiveTimeouts).toBe(1);
    expect(entry.cooldownUntil).toBeGreaterThan(Date.now() + 25000);
    expect(entry.cooldownUntil).toBeLessThanOrEqual(Date.now() + 35000);

    // Reset for 2nd timeout
    entry.status = 'AVAILABLE'; entry.cooldownUntil = null;

    // 2nd timeout: backoff = 30000 * 2^1 = 60000ms
    ModelRegistry.recordFailure('gemini:flash', new Error('timed out after 20000ms'));
    expect(entry.consecutiveTimeouts).toBe(2);
    expect(entry.cooldownUntil).toBeGreaterThan(Date.now() + 55000);

    // 3rd timeout: backoff = 30000 * 2^2 = 120000ms
    entry.status = 'AVAILABLE'; entry.cooldownUntil = null;
    ModelRegistry.recordFailure('gemini:flash', new Error('timed out'));
    expect(entry.consecutiveTimeouts).toBe(3);
    expect(entry.cooldownUntil).toBeGreaterThan(Date.now() + 100000);
  });

  // ── 19. Timeout is NOT confused with quota exhaustion ──────────────────────
  it('TIMEOUT classification never sets QUOTA_EXHAUSTED', () => {
    const provider = makeProvider('gemini', async () => ({}));
    const entry = makeEntry('gemini:flash', 'gemini', 1, provider);
    resetRegistry(entry);

    ModelRegistry.recordFailure('gemini:flash', new Error('timed out after 20000ms'));
    expect(entry.status).toBe('DEGRADED');
    expect(entry.status).not.toBe('QUOTA_EXHAUSTED');
    expect(entry.quotaResetAt).toBeNull();
  });

  // ── 20. consecutiveTimeouts resets on success ──────────────────────────────
  it('consecutiveTimeouts resets to 0 after a successful request', () => {
    const provider = makeProvider('or', async () => ({}));
    const entry = makeEntry('or:free', 'openrouter', 3, provider);
    resetRegistry(entry);

    ModelRegistry.recordFailure('or:free', new Error('timed out'));
    ModelRegistry.recordFailure('or:free', new Error('timed out'));
    expect(entry.consecutiveTimeouts).toBe(2);

    ModelRegistry.recordSuccess('or:free', 1500);
    expect(entry.consecutiveTimeouts).toBe(0);
    expect(entry.status).toBe('AVAILABLE');
  });

  // ── 21. INVALID_RESPONSE classification ────────────────────────────────────
  it('User Safety: safe response is classified as INVALID_RESPONSE', () => {
    const cls = ModelRegistry.classifyError(new Error('OpenRouter returned a safety/non-JSON response. Preview: "User Safety: safe". Model: openrouter/free'));
    expect(cls).toBe('INVALID_RESPONSE');
  });

  it('INVALID_RESPONSE first occurrence: model stays eligible', () => {
    const provider = makeProvider('or', async () => ({}));
    const entry = makeEntry('or:free', 'openrouter', 3, provider);
    resetRegistry(entry);

    ModelRegistry.recordFailure('or:free', new Error('OpenRouter returned invalid JSON. Preview: "User Safety: safe"'));
    expect(entry.invalidResponseCount).toBe(1);
    expect(entry.status).not.toBe('DISABLED');
    expect(entry.status).not.toBe('DEGRADED');

    // Second occurrence → DEGRADED
    ModelRegistry.recordFailure('or:free', new Error('invalid response: non-json'));
    expect(entry.invalidResponseCount).toBe(2);
    expect(entry.status).toBe('DEGRADED');
  });

  // ── 22. PROBING recovery ───────────────────────────────────────────────────
  it('DEGRADED model transitions to PROBING when cooldown expires', () => {
    const provider = makeProvider('or', async () => ({ ok: true }));
    const entry = makeEntry('or:free', 'openrouter', 3, provider, 'DEGRADED');
    entry.cooldownUntil = Date.now() - 1000; // expired
    resetRegistry(entry);

    const eligible = ModelRegistry.getEligible();
    expect(eligible.length).toBe(1);
    expect(eligible[0].status).toBe('PROBING');
  });

  it('PROBING model → successful request → AVAILABLE', () => {
    const provider = makeProvider('or', async () => ({}));
    const entry = makeEntry('or:free', 'openrouter', 3, provider, 'PROBING');
    resetRegistry(entry);

    ModelRegistry.recordSuccess('or:free', 800);
    expect(entry.status).toBe('AVAILABLE');
    expect(entry.consecutiveTimeouts).toBe(0);
  });

  // ── 23. DEGRADED / PROBING score haircut ──────────────────────────────────
  it('DEGRADED model scores much lower than AVAILABLE model', () => {
    const p1 = makeProvider('g', async () => ({}));
    const p2 = makeProvider('or', async () => ({}));

    const gemini  = makeEntry('gemini:flash', 'gemini', 1, p1, 'AVAILABLE');
    const orModel = makeEntry('or:free', 'openrouter', 2, p2, 'DEGRADED');
    resetRegistry(gemini, orModel);

    expect(ModelRegistry.score(gemini)).toBeGreaterThan(ModelRegistry.score(orModel) * 2);
  });

  // ── 24. OpenRouter 404 → MODEL_NOT_FOUND → DISABLED ──────────────────────
  it('HTTP 404 is classified as MODEL_NOT_FOUND and model is DISABLED', () => {
    const err = new Error('OpenRouter API Error: 404 Not Found - model does not exist');
    (err as any).statusCode = 404;
    
    const cls = ModelRegistry.classifyError(err);
    expect(cls).toBe('MODEL_NOT_FOUND');

    const provider = makeProvider('or', async () => ({}));
    const entry = makeEntry('or:model-a', 'openrouter', 3, provider);
    resetRegistry(entry);

    ModelRegistry.recordFailure('or:model-a', err);
    expect(entry.status).toBe('DISABLED');

    // Should not appear in eligible pool
    const eligible = ModelRegistry.getEligible();
    expect(eligible.find(m => m.id === 'or:model-a')).toBeUndefined();
  });

  // ── 25. All 4 real-world failures → AI_UNAVAILABLE ────────────────────────
  it('Gemini=TIMEOUT, Groq=DISABLED, OR=INVALID_RESPONSE, HF=NETWORK → AI_UNAVAILABLE', async () => {
    let attempt = 0;
    const makeFailer = (err: Error) => makeProvider('x', async () => { throw err; });

    const geminiErr = new Error('gemini:flash timed out after 20000ms');
    const orErr = new Error('OpenRouter returned invalid JSON. Preview: "User Safety: safe"');
    const hfErr = Object.assign(new Error('fetch failed: connect ECONNREFUSED'), { name: 'NetworkError' });

    resetRegistry(
      makeEntry('gemini:flash',  'gemini',      1, makeFailer(geminiErr)),
      makeEntry('groq:llama',    'groq',         2, makeProvider('x', async () => ({ ok: true })), 'DISABLED'),
      makeEntry('or:free',       'openrouter',   3, makeFailer(orErr)),
      makeEntry('hf:llama',      'huggingface',  4, makeFailer(hfErr)),
    );

    await expect(
      DynamicModelRouter.executeWithFailover('prompt', 'ScreeningAnalysis', undefined, 'Test:AllFail')
    ).rejects.toThrow(AIUnavailableError);

    // Groq was DISABLED from start — never attempted
    // Gemini → DEGRADED, OR → INVALID_RESPONSE, HF → COOLDOWN
    expect(ModelRegistry.get('gemini:flash')?.status).toBe('DEGRADED');
    expect(ModelRegistry.get('groq:llama')?.status).toBe('DISABLED');
  });
});
