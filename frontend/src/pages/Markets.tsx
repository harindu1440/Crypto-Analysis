import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Search, Filter, Plus, Check } from 'lucide-react';
import { getAvailableSymbols } from '../services/binanceApi';
import { useGlobalMarketData } from '../context/MarketDataContext';

const Markets: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [symbols, setSymbols] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedSymbols, addSymbol, removeSymbol } = useGlobalMarketData();

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const data = await getAvailableSymbols();
        setSymbols(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSymbols();
  }, []);

  const filteredSymbols = symbols.filter(s => 
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 50); // Limit to 50 for performance

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Markets</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>View and filter all available cryptocurrency markets <span style={{ color: 'var(--color-positive)', marginLeft: '8px', fontSize: '12px', padding: '2px 6px', border: '1px solid var(--color-positive)', borderRadius: '4px' }}>LIVE BINANCE DATA</span></p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Search markets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '8px 12px 8px 36px',
                borderRadius: '4px',
                outline: 'none',
                width: '250px'
              }}
            />
          </div>
          <button style={{
            backgroundColor: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '8px 16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}>
            <Filter size={16} /> Filter
          </button>
        </div>
      </header>

      <Card>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Binance Markets...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Base Asset</th>
                  <th>Quote Asset</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSymbols.map((s) => {
                  const isSelected = selectedSymbols.includes(s.symbol);
                  return (
                    <tr key={s.symbol}>
                      <td>
                        <div style={{ fontWeight: 'bold' }}>
                          <Link to={`/markets/${s.symbol}`} className="text-blue-400 hover:text-blue-300">
                            {s.symbol}
                          </Link>
                        </div>
                      </td>
                      <td>{s.baseAsset}</td>
                      <td>{s.quoteAsset}</td>
                      <td>
                        <span style={{ color: 'var(--color-positive)', fontSize: '12px' }}>{s.status}</span>
                      </td>
                      <td>
                        <button 
                          onClick={() => isSelected ? removeSymbol(s.symbol) : addSymbol(s.symbol)}
                          style={{
                            backgroundColor: isSelected ? 'var(--border-color)' : 'var(--color-accent)',
                            color: isSelected ? 'var(--text-primary)' : 'var(--bg-color)',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 'bold',
                            fontSize: '12px'
                          }}
                        >
                          {isSelected ? <><Check size={14} /> Selected</> : <><Plus size={14} /> Monitor</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Markets;
