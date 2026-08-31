type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  timestamp: number;
  level: AlertLevel;
  message: string;
  source: string;
  dedupKey?: string;
}

export class AlertService {
  private static alerts: Alert[] = [];
  private static dedupMap: Map<string, number> = new Map();
  private static readonly DEDUP_MS = parseInt(process.env.ALERT_DEDUP_MINUTES || '10', 10) * 60 * 1000;
  private static readonly MAX_ALERTS = 1000;

  static log(level: AlertLevel, source: string, message: string, dedupKey?: string) {
    const now = Date.now();

    if (dedupKey) {
      const lastSeen = this.dedupMap.get(dedupKey);
      if (lastSeen && now - lastSeen < this.DEDUP_MS) {
        return; // Suppress duplicate
      }
      this.dedupMap.set(dedupKey, now);
    }

    const alert: Alert = {
      id: `ALT_${now}_${Math.floor(Math.random() * 10000)}`,
      timestamp: now,
      level,
      source,
      message,
      dedupKey
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts.pop();
    }

    console.log(`[ALERT | ${level} | ${source}] ${message}`);

    // If critical, trigger emergency protocols or notifications
    if (level === 'CRITICAL') {
      // Integration with notification service goes here
    }
  }

  static getAlerts() {
    return this.alerts;
  }
}
