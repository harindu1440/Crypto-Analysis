import { AIProvider, ProviderHealth } from './provider.interface';
import { EventBus } from '../../system/eventBus';

export abstract class BaseAIProvider implements AIProvider {
  public abstract name: string;
  
  protected consecutiveFailures = 0;
  protected rateLimitCount = 0;
  protected lastFailure: number | null = null;
  protected cooldownUntil: number | null = null;
  
  protected readonly COOLDOWN_MS = parseInt(process.env.AI_PROVIDER_COOLDOWN_MS || '300000');
  
  public abstract isConfigured(): boolean;
  public abstract generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T>;
  
  public getHealth(): ProviderHealth {
    if (!this.isConfigured()) {
      return { status: 'OFFLINE', consecutiveFailures: 0, rateLimitCount: 0, lastFailure: null, cooldownUntil: null };
    }
    
    let status: ProviderHealth['status'] = 'HEALTHY';
    
    if (this.cooldownUntil && Date.now() < this.cooldownUntil) {
      status = 'COOLDOWN';
    } else if (this.cooldownUntil && Date.now() >= this.cooldownUntil) {
      // Cooldown expired, transition to HALF_OPEN by calling it DEGRADED until next success
      status = 'DEGRADED'; 
    } else if (this.consecutiveFailures > 0) {
      status = 'DEGRADED';
    }
    
    return {
      status,
      consecutiveFailures: this.consecutiveFailures,
      rateLimitCount: this.rateLimitCount,
      lastFailure: this.lastFailure,
      cooldownUntil: this.cooldownUntil
    };
  }
  
  public recordSuccess(): void {
    if (this.consecutiveFailures > 0 || this.cooldownUntil) {
      console.log(`[${this.name}] Provider recovered. Circuit breaker CLOSED.`);
    }
    this.consecutiveFailures = 0;
    this.cooldownUntil = null;
  }
  
  public recordFailure(error: any): void {
    this.consecutiveFailures++;
    this.lastFailure = Date.now();
    
    const errMessage = error?.message?.toLowerCase() || '';
    if (errMessage.includes('429') || errMessage.includes('rate limit') || errMessage.includes('too many requests')) {
      this.rateLimitCount++;
    }
    
    // Circuit Breaker logic
    if (this.consecutiveFailures >= 3 || errMessage.includes('429')) {
      this.cooldownUntil = Date.now() + this.COOLDOWN_MS;
      console.warn(`[${this.name}] Circuit Breaker OPEN. Cooldown for ${this.COOLDOWN_MS}ms.`);
      EventBus.publish({
        eventType: 'SYSTEM_ALERT',
        source: this.name,
        payload: { message: `${this.name} entered cooldown due to repeated failures or rate limits.` }
      });
    }
  }
}
