import { EventBus } from '../system/eventBus';
import { AlertService } from '../system/alertService';

export type AIStatus = 'HEALTHY' | 'DEGRADED' | 'QUOTA_EXHAUSTED' | 'OFFLINE';

export interface GeminiUsageStats {
  requestsThisMinute: number;
  requestsThisHour: number;
  requestsToday: number;
  failedRequestsToday: number;
  lastRequestAt: number | null;
  quotaResetTime: number | null;
}

class GeminiBudgetManagerImpl {
  public status: AIStatus = 'OFFLINE';
  
  // Rate Limit Defaults (Free Tier)
  private readonly MAX_REQ_PER_MIN = parseInt(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE || '15', 10);
  private readonly MAX_REQ_PER_HOUR = parseInt(process.env.GEMINI_MAX_REQUESTS_PER_HOUR || '150', 10);
  private readonly MAX_REQ_PER_DAY = parseInt(process.env.GEMINI_MAX_REQUESTS_PER_DAY || '1500', 10);

  private stats: GeminiUsageStats = {
    requestsThisMinute: 0,
    requestsThisHour: 0,
    requestsToday: 0,
    failedRequestsToday: 0,
    lastRequestAt: null,
    quotaResetTime: null
  };

  private minResetTimer: NodeJS.Timeout | null = null;
  private hourResetTimer: NodeJS.Timeout | null = null;
  private dayResetTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startTimers();
    if (process.env.GEMINI_API_KEY) {
      this.status = 'HEALTHY';
    }
  }

  private startTimers() {
    // Reset minute counters
    this.minResetTimer = setInterval(() => {
      this.stats.requestsThisMinute = 0;
      if (this.status === 'DEGRADED' && !this.stats.quotaResetTime) {
         this.status = 'HEALTHY';
      }
    }, 60 * 1000);

    // Reset hour counters
    this.hourResetTimer = setInterval(() => {
      this.stats.requestsThisHour = 0;
    }, 60 * 60 * 1000);

    // Reset day counters (approx 24h)
    this.dayResetTimer = setInterval(() => {
      this.stats.requestsToday = 0;
      this.stats.failedRequestsToday = 0;
      if (this.status === 'QUOTA_EXHAUSTED') {
         this.status = 'HEALTHY';
         this.stats.quotaResetTime = null;
         AlertService.log('INFO', 'AI', 'Gemini Daily Quota has reset. AI is HEALTHY.');
      }
    }, 24 * 60 * 60 * 1000);
  }

  public canMakeRequest(): boolean {
    if (this.status === 'OFFLINE') return false;
    if (this.status === 'QUOTA_EXHAUSTED') {
      if (this.stats.quotaResetTime && Date.now() > this.stats.quotaResetTime) {
        this.status = 'HEALTHY';
        this.stats.quotaResetTime = null;
        return true;
      }
      return false;
    }
    
    // Prevent blowing past local rate limits
    if (this.stats.requestsThisMinute >= this.MAX_REQ_PER_MIN) return false;
    if (this.stats.requestsThisHour >= this.MAX_REQ_PER_HOUR) return false;
    if (this.stats.requestsToday >= this.MAX_REQ_PER_DAY) return false;
    
    return true;
  }

  public recordRequest(success: boolean) {
    const now = Date.now();
    this.stats.lastRequestAt = now;
    
    if (success) {
      this.stats.requestsThisMinute++;
      this.stats.requestsThisHour++;
      this.stats.requestsToday++;
    } else {
      this.stats.failedRequestsToday++;
    }
  }

  public markQuotaExhausted(dailyReset: boolean, retryDelayMs?: number) {
    if (dailyReset) {
      this.status = 'QUOTA_EXHAUSTED';
      this.stats.quotaResetTime = Date.now() + (24 * 60 * 60 * 1000); // Wait 24h if API doesn't tell us
      AlertService.log('CRITICAL', 'AI', 'Gemini Daily Quota Exhausted. AI Paused.');
      EventBus.publish({
        eventType: 'SYSTEM_ALERT',
        source: 'GeminiBudgetManager',
        payload: { message: 'Gemini Daily Quota Exhausted. AI Analysis Paused.' }
      });
    } else {
      this.status = 'DEGRADED';
      if (retryDelayMs) {
        this.stats.quotaResetTime = Date.now() + retryDelayMs;
      }
      AlertService.log('WARNING', 'AI', 'Gemini API Temporary Rate Limit Hit.');
    }
  }

  public getStatus() {
    return {
      status: this.status,
      stats: this.stats,
      limits: {
        perMinute: this.MAX_REQ_PER_MIN,
        perHour: this.MAX_REQ_PER_HOUR,
        perDay: this.MAX_REQ_PER_DAY
      }
    };
  }
  
  public resetForTesting() {
      this.status = process.env.GEMINI_API_KEY ? 'HEALTHY' : 'OFFLINE';
      this.stats = {
        requestsThisMinute: 0,
        requestsThisHour: 0,
        requestsToday: 0,
        failedRequestsToday: 0,
        lastRequestAt: null,
        quotaResetTime: null
      };
  }
}

export const GeminiBudgetManager = new GeminiBudgetManagerImpl();
