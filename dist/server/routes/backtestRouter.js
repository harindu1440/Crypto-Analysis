"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backtestRouter = void 0;
const express_1 = require("express");
const database_1 = require("../config/database");
const backtestEngine_1 = require("../services/backtest/backtestEngine");
const performanceService_1 = require("../services/backtest/performanceService");
const crypto_1 = __importDefault(require("crypto"));
exports.backtestRouter = (0, express_1.Router)();
// Keep jobs in memory or DB (we use DB for persistence across restarts if needed)
// For simplicity in Phase 18, we can store jobs in LocalDatabase
exports.backtestRouter.post('/run', async (req, res) => {
    const { startDate, endDate, symbols, timeframes } = req.body;
    const jobId = crypto_1.default.randomUUID();
    const job = {
        id: jobId,
        status: 'RUNNING',
        progress: 0,
        total: 0,
        results: [],
        metrics: null,
        startedAt: Date.now(),
        completedAt: null
    };
    database_1.LocalDatabase.set('backtestJobs', { ...database_1.LocalDatabase.get('backtestJobs'), [jobId]: job });
    // Respond immediately
    res.json({ jobId, message: 'Backtest started' });
    // Background processing
    setTimeout(async () => {
        try {
            const allOpps = database_1.LocalDatabase.get('opportunities') || [];
            // Filter opportunities
            let filtered = allOpps;
            if (startDate)
                filtered = filtered.filter(o => o.createdAt >= startDate);
            if (endDate)
                filtered = filtered.filter(o => o.createdAt <= endDate);
            if (symbols && symbols.length > 0)
                filtered = filtered.filter(o => symbols.includes(o.symbol));
            if (timeframes && timeframes.length > 0)
                filtered = filtered.filter(o => timeframes.includes(o.timeframe));
            const jobs = database_1.LocalDatabase.get('backtestJobs');
            jobs[jobId].total = filtered.length;
            database_1.LocalDatabase.set('backtestJobs', jobs);
            const results = [];
            for (let i = 0; i < filtered.length; i++) {
                const opp = filtered[i];
                try {
                    const res = await backtestEngine_1.BacktestEngine.runBacktest(opp);
                    results.push(res);
                }
                catch (e) {
                    console.error(`[Backtest] Failed on opportunity ${opp.id}:`, e);
                }
                // Update progress
                const currentJobs = database_1.LocalDatabase.get('backtestJobs');
                currentJobs[jobId].progress = i + 1;
                database_1.LocalDatabase.set('backtestJobs', currentJobs);
            }
            // Finalize
            const metrics = performanceService_1.PerformanceService.calculateMetrics(results);
            const qualityGroups = performanceService_1.PerformanceService.groupByQualityScore(results);
            const finalJobs = database_1.LocalDatabase.get('backtestJobs');
            finalJobs[jobId].status = 'COMPLETED';
            finalJobs[jobId].results = results;
            finalJobs[jobId].metrics = { overall: metrics, byQuality: qualityGroups };
            finalJobs[jobId].completedAt = Date.now();
            database_1.LocalDatabase.set('backtestJobs', finalJobs);
            // Save global backtests array
            const globalBacktests = database_1.LocalDatabase.get('backtests');
            globalBacktests.push({
                id: jobId,
                timestamp: Date.now(),
                metrics
            });
            database_1.LocalDatabase.set('backtests', globalBacktests);
        }
        catch (e) {
            console.error('[Backtest] Job Failed:', e);
            const finalJobs = database_1.LocalDatabase.get('backtestJobs');
            finalJobs[jobId].status = 'FAILED';
            database_1.LocalDatabase.set('backtestJobs', finalJobs);
        }
    }, 0);
});
exports.backtestRouter.get('/status/:id', (req, res) => {
    const job = database_1.LocalDatabase.get('backtestJobs')[req.params.id];
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    res.json({
        id: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total
    });
});
exports.backtestRouter.get('/results/:id', (req, res) => {
    const job = database_1.LocalDatabase.get('backtestJobs')[req.params.id];
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});
