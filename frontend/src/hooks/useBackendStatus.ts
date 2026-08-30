import { useState, useEffect } from 'react';
import { checkHealth } from '../services/api';

export type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

export const useBackendStatus = () => {
  const [status, setStatus] = useState<ConnectionStatus>('loading');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await checkHealth();
        if (res.status === 'ok') {
          setStatus('connected');
        } else {
          setStatus('disconnected');
        }
      } catch (err) {
        setStatus('disconnected');
      }
    };

    fetchStatus();
    // Re-check periodically
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return status;
};
