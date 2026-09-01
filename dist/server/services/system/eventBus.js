"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const events_1 = require("events");
class SystemEventBus extends events_1.EventEmitter {
    constructor() {
        super();
        // Increase max listeners since we have many services subscribing
        this.setMaxListeners(50);
    }
    publish(event) {
        const fullEvent = {
            ...event,
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            timestamp: Date.now(),
        };
        // Log critical events for observability
        if (fullEvent.eventType === 'SYSTEM_ALERT' || fullEvent.eventType === 'OPPORTUNITY_INVALIDATED') {
            console.log(`[EventBus] ${fullEvent.eventType} | Source: ${fullEvent.source} | Symbol: ${fullEvent.symbol || 'N/A'}`);
        }
        this.emit(event.eventType, fullEvent);
    }
    subscribe(eventType, listener) {
        this.on(eventType, listener);
        return () => {
            this.off(eventType, listener);
        };
    }
}
exports.EventBus = new SystemEventBus();
