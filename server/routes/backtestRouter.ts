import { Router, Request, Response } from 'express';
import { LocalDatabase } from '../config/database';
import { BacktestEngine, BacktestResult } from '../services/backtest/backtestEngine';
import { PerformanceService } from '../services/backtest/performanceService';
import { TradeOpportunity } from '../services/opportunities/types';
import crypto from 'crypto';

export const backtestRouter = Router();

// Keep jobs in memory or DB (we use DB for persistence across restarts if needed)
// For simplicity in Phase 18, we can store jobs in LocalDatabase

backtestRouter.post('/run', async (req: Request, res: Response) => {
  const { startDate, endDate, symbols, timeframes } = req.body;
  
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: 'RUNNING',
    progress: 0,
    total: 0,
    results: [] as BacktestResult[],
    metrics: null as any,
    startedAt: Date.now(),
    completedAt: null as number | null
  };
  
  LocalDatabase.set('backtestJobs', { ...LocalDatabase.get('backtestJobs'), [jobId]: job });
  
  // Respond immediately
  res.json({ jobId, message: 'Backtest started' });
  
  // Background processing
  setTimeout(async () => {
    try {
      const allOpps: TradeOpportunity[] = LocalDatabase.get('opportunities') || [];
      
      // Filter opportunities
      let filtered = allOpps;
      if (startDate) filtered = filtered.filter(o => o.createdAt >= startDate);
      if (endDate) filtered = filtered.filter(o => o.createdAt <= endDate);
      if (symbols && symbols.length > 0) filtered = filtered.filter(o => symbols.includes(o.symbol));
      if (timeframes && timeframes.length > 0) filtered = filtered.filter(o => timeframes.includes(o.timeframe));
      
      const jobs = LocalDatabase.get('backtestJobs');
      jobs[jobId].total = filtered.length;
      LocalDatabase.set('backtestJobs', jobs);
      
      const results: BacktestResult[] = [];
      
      for (let i = 0; i < filtered.length; i++) {
        const opp = filtered[i];
        try {
          const res = await BacktestEngine.runBacktest(opp);
          results.push(res);
        } catch (e) {
          console.error(`[Backtest] Failed on opportunity ${opp.id}:`, e);
        }
        
        // Update progress
        const currentJobs = LocalDatabase.get('backtestJobs');
        currentJobs[jobId].progress = i + 1;
        LocalDatabase.set('backtestJobs', currentJobs);
      }
      
      // Finalize
      const metrics = PerformanceService.calculateMetrics(results);
      const qualityGroups = PerformanceService.groupByQualityScore(results);
      
      const finalJobs = LocalDatabase.get('backtestJobs');
      finalJobs[jobId].status = 'COMPLETED';
      finalJobs[jobId].results = results;
      finalJobs[jobId].metrics = { overall: metrics, byQuality: qualityGroups };
      finalJobs[jobId].completedAt = Date.now();
      LocalDatabase.set('backtestJobs', finalJobs);
      
      // Save global backtests array
      const globalBacktests = LocalDatabase.get('backtests');
      globalBacktests.push({
        id: jobId,
        timestamp: Date.now(),
        metrics
      });
      LocalDatabase.set('backtests', globalBacktests);
      
    } catch (e) {
      console.error('[Backtest] Job Failed:', e);
      const finalJobs = LocalDatabase.get('backtestJobs');
      finalJobs[jobId].status = 'FAILED';
      LocalDatabase.set('backtestJobs', finalJobs);
    }
  }, 0);
});

backtestRouter.get('/status/:id', (req: Request, res: Response) => {
  const job = LocalDatabase.get('backtestJobs')[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    total: job.total
  });
});

backtestRouter.get('/results/:id', (req: Request, res: Response) => {
  const job = LocalDatabase.get('backtestJobs')[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  res.json(job);
});
