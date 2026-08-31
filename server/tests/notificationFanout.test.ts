import { NotificationOrchestrator } from '../services/notifications/notificationOrchestrator';
import { LocalDatabase } from '../config/database';
import { AuthService } from '../services/auth/authService';
import { UserService } from '../services/user/userService';

describe('Notification Fan-Out', () => {
  beforeEach(() => {
    LocalDatabase['data'] = {
      scheduledPlans: [],
      executionState: [],
      auditLog: [],
      positions: [],
      emergencyState: { isHalted: false },
      dailyRiskState: { date: new Date().toISOString().split('T')[0], realizedLoss: 0 },
      monitoredAssets: [],
      monitoringEvents: [],
      opportunities: [],
      notifications: [],
      users: [],
      sessions: [],
      watchlists: {},
      savedOpportunities: [],
      userPreferences: {},
      historicalData: [],
      backtests: [],
      backtestJobs: {}
    };
  });

  it('should fan out notifications correctly based on preferences', () => {
    // 1. Create two users
    const u1 = AuthService.register('u1@test.com', 'pass', 'U1');
    const u2 = AuthService.register('u2@test.com', 'pass', 'U2');

    // 2. Set U1 to only want high quality (80+) and LONG
    UserService.updatePreferences(u1.id, {
      minQualityScore: 80,
      direction: 'LONG'
    });

    // 3. Set U2 to want everything (default is 75+, BOTH)
    UserService.updatePreferences(u2.id, {
      minQualityScore: 75,
      direction: 'BOTH'
    });

    // 4. Dispatch a 78-score SHORT opportunity
    NotificationOrchestrator.dispatch(
      'NEW_OPPORTUNITY',
      'HIGH',
      'Test',
      'Test Msg',
      { id: 'opp1', symbol: 'BTCUSDT', direction: 'SHORT', qualityScore: 78, timeframe: '15m', version: 1 } as any
    );

    // 5. Verify results
    const notifications = LocalDatabase.get('notifications') || [];
    
    // U1 should NOT receive it (wants 80+, wants LONG)
    const n1 = notifications.filter((n: any) => n.userId === u1.id);
    expect(n1.length).toBe(0);

    // U2 SHOULD receive it (wants 75+, wants BOTH)
    const n2 = notifications.filter((n: any) => n.userId === u2.id);
    expect(n2.length).toBe(1);
    expect(n2[0].opportunityId).toBe('opp1');
  });

  it('should deduplicate per user', () => {
    const u1 = AuthService.register('u3@test.com', 'pass', 'U3');

    // Dispatch same alert twice
    NotificationOrchestrator.dispatch(
      'NEW_OPPORTUNITY',
      'HIGH',
      'Test',
      'Test Msg',
      { id: 'opp2', symbol: 'ETHUSDT', direction: 'LONG', qualityScore: 90, timeframe: '15m', version: 1 } as any
    );

    NotificationOrchestrator.dispatch(
      'NEW_OPPORTUNITY',
      'HIGH',
      'Test',
      'Test Msg',
      { id: 'opp2', symbol: 'ETHUSDT', direction: 'LONG', qualityScore: 90, timeframe: '15m', version: 1 } as any
    );

    const notifications = LocalDatabase.get('notifications') || [];
    const n = notifications.filter((n: any) => n.userId === u1.id);
    expect(n.length).toBe(1); // Only 1 should be stored
  });
});
