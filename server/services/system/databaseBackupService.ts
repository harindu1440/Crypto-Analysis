import fs from 'fs';
import path from 'path';

export class DatabaseBackupService {
  private static backupDir = path.join(__dirname, '../../../data/backups');
  private static dbPath = path.join(__dirname, '../../../data/database.json');
  private static MAX_RETENTION = parseInt(process.env.DATABASE_BACKUP_RETENTION || '7', 10);

  static init() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    // Backup on startup
    this.createBackup();

    // Backup every 6 hours
    setInterval(() => this.createBackup(), 6 * 60 * 60 * 1000);
  }

  static createBackup() {
    if (!fs.existsSync(this.dbPath)) return;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `database-${timestamp}.json`);
      
      // Copy current DB
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`[Backup] Created DB backup at ${backupPath}`);
      
      this.cleanupOldBackups();
    } catch (e: any) {
      console.error(`[Backup] Failed to create database backup: ${e.message}`);
    }
  }

  static cleanupOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('database-') && f.endsWith('.json'))
        .map(f => ({ name: f, path: path.join(this.backupDir, f), stat: fs.statSync(path.join(this.backupDir, f)) }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

      if (files.length > this.MAX_RETENTION) {
        const toDelete = files.slice(this.MAX_RETENTION);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
          console.log(`[Backup] Deleted old backup ${file.name}`);
        }
      }
    } catch (e: any) {
      console.error(`[Backup] Cleanup failed: ${e.message}`);
    }
  }
}
