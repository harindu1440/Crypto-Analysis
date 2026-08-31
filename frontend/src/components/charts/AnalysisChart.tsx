import React, { useEffect, useRef, useState } from 'react';
import { createChart, LineStyle, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { Card } from '../common/Card';
import './AnalysisChart.css';

interface Props {
  symbol: string;
}

const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

export const AnalysisChart: React.FC<Props> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1h');
  const [tooltipData, setTooltipData] = useState<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });
    
    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    seriesRef.current = candlestickSeries;

    // Fetch initial data
    setLoading(true);
    fetch(`/api/markets/klines/${symbol}?interval=${timeframe}&limit=100`)
      .then(res => {
        if (!res.ok) throw new Error(`Klines API returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No kline data received');
        }
        const formatted = data
          .map((k: any) => ({
            time: Math.floor(k.openTime / 1000) as any,
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close)
          }))
          .filter(k => k.open > 0 && k.high > 0 && k.low > 0 && k.close > 0)
          .sort((a, b) => (a.time as number) - (b.time as number));
        
        candlestickSeries.setData(formatted);
        setLoading(false);
        
        // Optionally annotate with opportunities (non-blocking)
        fetch('/api/opportunities')
          .then(r => r.ok ? r.json() : [])
          .then(opps => {
            if (!Array.isArray(opps)) return;
            const myOpp = opps.find((o: any) => o.symbol === symbol);
            if (myOpp && seriesRef.current) {
              if (myOpp.entryPrice) seriesRef.current.createPriceLine({ price: myOpp.entryPrice, color: '#3b82f6', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'ENTRY' });
              if (myOpp.stopLoss) seriesRef.current.createPriceLine({ price: myOpp.stopLoss, color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'SL' });
              if (myOpp.takeProfitTargets?.[0]) seriesRef.current.createPriceLine({ price: myOpp.takeProfitTargets[0], color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'TP' });
            }
          })
          .catch(() => {}); // opportunities are optional
      })
      .catch(err => {
        console.error('Failed to load chart data', err);
        setLoading(false);
      });

    // Add Tooltip logic
    chart.subscribeCrosshairMove(param => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        setTooltipData(null);
      } else {
        const data = param.seriesData.get(candlestickSeries) as any;
        if (data) {
          setTooltipData({
            time: param.time,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            x: param.point.x,
            y: param.point.y
          });
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe]);

  return (
    <Card title={`Interactive Analysis: ${symbol}`}>
      <div className="chart-controls">
        {TIMEFRAMES.map(tf => (
          <button 
            key={tf} 
            className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
            onClick={() => setTimeframe(tf)}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>
      
      <div className="analysis-chart-container">
        {loading && <div className="chart-loading">Loading market data...</div>}
        
        <div className="chart-legend">
          <div><span style={{color: 'blue'}}>---</span> ENTRY</div>
          <div><span style={{color: 'red'}}>—</span> STOP LOSS</div>
          <div><span style={{color: 'green'}}>—</span> TAKE PROFIT</div>
        </div>

        {tooltipData && (
          <div className="chart-tooltip" style={{ left: tooltipData.x + 15, top: tooltipData.y + 15 }}>
            <div>O: <strong>{tooltipData.open}</strong></div>
            <div>H: <strong>{tooltipData.high}</strong></div>
            <div>L: <strong>{tooltipData.low}</strong></div>
            <div>C: <strong>{tooltipData.close}</strong></div>
          </div>
        )}

        <div ref={chartContainerRef} className="chart-wrapper" />
      </div>
    </Card>
  );
};
