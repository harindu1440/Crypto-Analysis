"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
class AlertService {
    static alerts = [];
    static dedupMap = new Map();
    static DEDUP_MS = parseInt(process.env.ALERT_DEDUP_MINUTES || '10', 10) * 60 * 1000;
    static MAX_ALERTS = 1000;
    static log(level, source, message, dedupKey) {
        const now = Date.now();
        if (dedupKey) {
            const lastSeen = this.dedupMap.get(dedupKey);
            if (lastSeen && now - lastSeen < this.DEDUP_MS) {
                return; // Suppress duplicate
            }
            this.dedupMap.set(dedupKey, now);
        }
        const alert = {
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
exports.AlertService = AlertService;
