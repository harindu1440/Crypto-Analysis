"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDatabase = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class LocalDatabase {
    static filePath = path_1.default.join(__dirname, '../../data/database.json');
    static lockPath = path_1.default.join(__dirname, '../../data/database.lock');
    static data = {
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
        historicalData: {},
        backtests: [],
        backtestJobs: {}
    };
    static initialize() {
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        if (!fs_1.default.existsSync(this.filePath)) {
            this.save();
        }
        else {
            this.load();
        }
    }
    static load() {
        try {
            const rawData = fs_1.default.readFileSync(this.filePath, 'utf8');
            this.data = JSON.parse(rawData);
            // Migration fallbacks
            if (!this.data.positions)
                this.data.positions = [];
            if (!this.data.emergencyState)
                this.data.emergencyState = { isHalted: false };
            if (!this.data.dailyRiskState)
                this.data.dailyRiskState = { date: new Date().toISOString().split('T')[0], realizedLoss: 0 };
            if (!this.data.users)
                this.data.users = [];
            if (!this.data.sessions)
                this.data.sessions = [];
            if (!this.data.watchlists)
                this.data.watchlists = {};
            if (!this.data.savedOpportunities)
                this.data.savedOpportunities = [];
            if (!this.data.userPreferences)
                this.data.userPreferences = {};
            if (!this.data.historicalData)
                this.data.historicalData = {};
            if (!this.data.backtests)
                this.data.backtests = [];
            if (!this.data.backtestJobs)
                this.data.backtestJobs = {};
        }
        catch (e) {
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
                opportunities: [],
                notifications: [],
                users: [],
                sessions: [],
                watchlists: {},
                savedOpportunities: [],
                userPreferences: {},
                historicalData: {},
                backtests: [],
                backtestJobs: {}
            };
        }
    }
    static save() {
        try {
            // Basic lock mechanism to prevent race conditions during write
            let retries = 0;
            while (fs_1.default.existsSync(this.lockPath) && retries < 10) {
                // block synchronous wait (not ideal for perf, but okay for low-volume background tasks)
                const start = Date.now();
                while (Date.now() - start < 10) { }
                retries++;
            }
            if (!fs_1.default.existsSync(this.lockPath)) {
                fs_1.default.writeFileSync(this.lockPath, '1');
                fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
                fs_1.default.unlinkSync(this.lockPath);
            }
        }
        catch (e) {
            console.error('Failed to save database:', e);
            if (fs_1.default.existsSync(this.lockPath)) {
                fs_1.default.unlinkSync(this.lockPath);
            }
        }
    }
    static get(key) {
        return this.data[key];
    }
    static set(key, value) {
        this.data[key] = value;
        this.save();
    }
    static insert(key, value) {
        if (!this.data[key])
            this.data[key] = [];
        this.data[key].push(value);
        this.save();
    }
}
exports.LocalDatabase = LocalDatabase;
