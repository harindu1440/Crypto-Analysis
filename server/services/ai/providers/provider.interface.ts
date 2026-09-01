export interface ProviderHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'OFFLINE' | 'COOLDOWN';
  consecutiveFailures: number;
  rateLimitCount: number;
  lastFailure: number | null;
  cooldownUntil: number | null;
}

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  getHealth(): ProviderHealth;
  recordSuccess(): void;
  recordFailure(error: any): void;
  generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T>;
}
