import fs from 'fs';
import path from 'path';

export interface LocalDatabaseSchema {
  scheduledPlans: any[];
  executionState: any[];
  auditLog: any[];
  positions: any[];
  emergencyState: any;
  dailyRiskState: any;
  monitoredAssets: any[];
  monitoringEvents: any[];
  opportunities: any[];
}

export class LocalDatabase {
  private static filePath = path.join(__dirname, '../../data/database.json');
  private static lockPath = path.join(__dirname, '../../data/database.lock');
  private static data: LocalDatabaseSchema = { 
    scheduledPlans: [], 
    executionState: [], 
    auditLog: [],
    positions: [],
    emergencyState: { isHalted: false },
    dailyRiskState: { date: new Date().toISOString().split('T')[0], realizedLoss: 0 },
    monitoredAssets: [],
    monitoringEvents: [],
    opportunities: []
  };

  public static initialize() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.save();
    } else {
      this.load();
    }
  }

  private static load() {
    try {
      const rawData = fs.readFileSync(this.filePath, 'utf8');
      this.data = JSON.parse(rawData);
      // Migration fallbacks
      if (!this.data.positions) this.data.positions = [];
      if (!this.data.emergencyState) this.data.emergencyState = { isHalted: false };
      if (!this.data.dailyRiskState) this.data.dailyRiskState = { date: new Date().toISOString().split('T')[0], realizedLoss: 0 };
    } catch (e) {
      console.error('Failed to load database:', e);
      this.data = { 
        scheduledPlans: [], 
        executionState: [], 
        auditLog: [],
        positions: [],
        emergencyState: { isHalted: false },
        dailyRiskState: { date: new Date().toISOString().split('T')[0], realizedLoss: 0 },
        monitoredAssets: [],
        monitoringEvents: [],
        opportunities: []
      };
    }
  }

  private static save() {
    try {
      // Basic lock mechanism to prevent race conditions during write
      let retries = 0;
      while (fs.existsSync(this.lockPath) && retries < 10) {
        // block synchronous wait (not ideal for perf, but okay for low-volume background tasks)
        const start = Date.now();
        while(Date.now() - start < 10) {}
        retries++;
      }
      
      if (!fs.existsSync(this.lockPath)) {
        fs.writeFileSync(this.lockPath, '1');
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        fs.unlinkSync(this.lockPath);
      }
    } catch (e) {
      console.error('Failed to save database:', e);
      if (fs.existsSync(this.lockPath)) {
         fs.unlinkSync(this.lockPath);
      }
    }
  }

  public static get(key: keyof LocalDatabaseSchema): any {
    return this.data[key];
  }

  public static set(key: keyof LocalDatabaseSchema, value: any) {
    this.data[key] = value;
    this.save();
  }

  public static insert(key: keyof LocalDatabaseSchema, value: any) {
    if (!this.data[key]) this.data[key] = [];
    this.data[key].push(value);
    this.save();
  }
}
