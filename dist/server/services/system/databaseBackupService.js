"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseBackupService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class DatabaseBackupService {
    static backupDir = path_1.default.join(__dirname, '../../../data/backups');
    static dbPath = path_1.default.join(__dirname, '../../../data/database.json');
    static MAX_RETENTION = parseInt(process.env.DATABASE_BACKUP_RETENTION || '7', 10);
    static init() {
        if (!fs_1.default.existsSync(this.backupDir)) {
            fs_1.default.mkdirSync(this.backupDir, { recursive: true });
        }
        // Backup on startup
        this.createBackup();
        // Backup every 6 hours
        setInterval(() => this.createBackup(), 6 * 60 * 60 * 1000);
    }
    static createBackup() {
        if (!fs_1.default.existsSync(this.dbPath))
            return;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path_1.default.join(this.backupDir, `database-${timestamp}.json`);
            // Copy current DB
            fs_1.default.copyFileSync(this.dbPath, backupPath);
            console.log(`[Backup] Created DB backup at ${backupPath}`);
            this.cleanupOldBackups();
        }
        catch (e) {
            console.error(`[Backup] Failed to create database backup: ${e.message}`);
        }
    }
    static cleanupOldBackups() {
        try {
            const files = fs_1.default.readdirSync(this.backupDir)
                .filter(f => f.startsWith('database-') && f.endsWith('.json'))
                .map(f => ({ name: f, path: path_1.default.join(this.backupDir, f), stat: fs_1.default.statSync(path_1.default.join(this.backupDir, f)) }))
                .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
            if (files.length > this.MAX_RETENTION) {
                const toDelete = files.slice(this.MAX_RETENTION);
                for (const file of toDelete) {
                    fs_1.default.unlinkSync(file.path);
                    console.log(`[Backup] Deleted old backup ${file.name}`);
                }
            }
        }
        catch (e) {
            console.error(`[Backup] Cleanup failed: ${e.message}`);
        }
    }
}
exports.DatabaseBackupService = DatabaseBackupService;
