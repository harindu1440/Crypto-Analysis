import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      login(data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] text-white">
      <div className="w-full max-w-md p-8 rounded-lg bg-[#111827] border border-gray-800 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center">Login to Terminal</h2>
        
        {error && <div className="mb-4 p-3 bg-red-500/20 text-red-400 rounded border border-red-500/30 text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 bg-[#1F2937] border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
              required 
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-[#1F2937] border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
              required 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-semibold transition-colors mt-2"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-gray-400">
          Don't have an account? <Link to="/register" className="text-blue-400 hover:text-blue-300">Register</Link>
        </div>
      </div>
    </div>
  );
};
