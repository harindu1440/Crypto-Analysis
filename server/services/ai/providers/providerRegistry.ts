import { AIProvider } from './provider.interface';
import { GeminiProvider } from './geminiProvider';
import { GroqProvider } from './groqProvider';
import { OpenRouterProvider } from './openRouterProvider';
import { HuggingFaceProvider } from './huggingFaceProvider';

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

    const gemini = new GeminiProvider();
    if (gemini.isConfigured()) {
      this.providers.push({ provider: gemini, role: 'INDEPENDENT MARKET ANALYST', priority: 1 });
    }

    const groq = new GroqProvider();
    if (groq.isConfigured()) {
      this.providers.push({ provider: groq, role: 'TECHNICAL ANALYST', priority: 2 });
    }

    const hf = new HuggingFaceProvider();
    if (hf.isConfigured()) {
      this.providers.push({ provider: hf, role: 'MOMENTUM ANALYST', priority: 3 });
    }

    const orModels = (process.env.OPENROUTER_MODELS || 'openrouter/free').split(',').map(s => s.trim());
    if (orModels.length > 0) {
      const or1 = new OpenRouterProvider(orModels[0]);
      if (or1.isConfigured()) {
        this.providers.push({ provider: or1, role: 'PRICE ACTION ANALYST', priority: 4 });
      }
    }
    
    if (orModels.length > 1) {
      const or2 = new OpenRouterProvider(orModels[1]);
      if (or2.isConfigured()) {
        this.providers.push({ provider: or2, role: 'RISK CHALLENGER', priority: 5 });
      }
    }

    this.initialized = true;
    console.log(`[ProviderRegistry] Initialized ${this.providers.length} AI providers.`);
  }

  public static getEligibleProviders(): ProviderRegistration[] {
    if (!this.initialized) this.initialize();
    
    return this.providers.filter(p => {
      const health = p.provider.getHealth();
      return health.status === 'HEALTHY' || health.status === 'DEGRADED';
    }).sort((a, b) => a.priority - b.priority);
  }

  public static isGeminiOnly(): boolean {
    if (!this.initialized) this.initialize();
    
    const configured = this.providers.filter(p => p.provider.isConfigured());
    // If only Gemini is configured, it's Gemini-only
    if (configured.length === 1 && configured[0].provider.name === 'gemini-provider') return true;
    
    // If Gemini is in COOLDOWN but other providers are healthy, switch to multi-model mode
    const geminiRegistration = configured.find(p => p.provider.name === 'gemini-provider');
    const geminiHealth = geminiRegistration?.provider.getHealth();
    const hasHealthyAlternatives = configured.some(
      p => p.provider.name !== 'gemini-provider' && 
           (p.provider.getHealth().status === 'HEALTHY' || p.provider.getHealth().status === 'DEGRADED')
    );
    
    if (geminiHealth?.status === 'COOLDOWN' && hasHealthyAlternatives) return false;
    
    return configured.length === 1 && configured[0].provider.name === 'gemini-provider';
  }

  public static getProviderHealths() {
    if (!this.initialized) this.initialize();
    
    return this.providers.map(p => ({
      name: p.provider.name,
      role: p.role,
      health: p.provider.getHealth()
    }));
  }
}
