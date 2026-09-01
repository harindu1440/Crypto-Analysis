import { EventEmitter } from 'events';

export type EventType =
  | 'MARKET_UPDATE'
  | 'CANDLE_CLOSE'
  | 'MARKET_REGIME_CHANGED'
  | 'AI_ANALYSIS_REQUESTED'
  | 'AI_ANALYSIS_COMPLETED'
  | 'OPPORTUNITY_CREATED'
  | 'OPPORTUNITY_UPDATED'
  | 'OPPORTUNITY_INVALIDATED'
  | 'OPPORTUNITY_APPROACHING'
  | 'ENTRY_TRIGGERED'
  | 'SYSTEM_ALERT';

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  timestamp: number;
  symbol?: string;
  source: string;
  correlationId?: string;
  payload: any;
}

class SystemEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners since we have many services subscribing
    this.setMaxListeners(50);
  }

  public publish(event: Omit<BaseEvent, 'eventId' | 'timestamp'>): void {
    const fullEvent: BaseEvent = {
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

  public subscribe(eventType: EventType, listener: (event: BaseEvent) => void): () => void {
    this.on(eventType, listener);
    return () => {
      this.off(eventType, listener);
    };
  }
}

export const EventBus = new SystemEventBus();
