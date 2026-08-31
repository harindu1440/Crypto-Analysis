import React, { useEffect, useRef, useState } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { Card } from '../common/Card';
import './AnalysisChart.css';

interface Props {
  symbol: string;
}

export const AnalysisChart: React.FC<Props> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(true);

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

    const candlestickSeries = (chart as any).addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    seriesRef.current = candlestickSeries;

    // Fetch initial data
    fetch(`/api/market/klines/${symbol}?interval=1h&limit=100`)
      .then(res => res.json())
      .then(data => {
        const formatted = data.map((k: any) => ({
          time: k.openTime / 1000,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close)
        }));
        candlestickSeries.setData(formatted);
        
        // Fetch any opportunities to annotate
        return fetch('/api/opportunities');
      })
      .then(res => res.json())
      .then(opps => {
        const myOpp = opps.find((o: any) => o.symbol === symbol);
        if (myOpp && seriesRef.current) {
          // Add Price Lines for AI Annotations
          seriesRef.current.createPriceLine({
            price: myOpp.entryPrice,
            color: 'blue',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'ENTRY',
          });
          
          seriesRef.current.createPriceLine({
            price: myOpp.stopLoss,
            color: 'red',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'SL',
          });

          if (myOpp.takeProfitTargets && myOpp.takeProfitTargets.length > 0) {
            seriesRef.current.createPriceLine({
              price: myOpp.takeProfitTargets[0],
              color: 'green',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: 'TP',
            });
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load chart data', err);
        setLoading(false);
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
  }, [symbol]);

  return (
    <Card title={`Interactive Analysis: ${symbol}`}>
      <div className="analysis-chart-container">
        {loading && <div className="chart-loading">Loading market data...</div>}
        <div ref={chartContainerRef} className="chart-wrapper" />
      </div>
    </Card>
  );
};
