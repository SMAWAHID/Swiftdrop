import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LoginPage: React.FC = () => {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const justRegistered = params.get('registered') === '1';

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const role = await login({ email: email.trim(), password });
      if (role === 'DRIVER')      navigate('/driver', { replace: true });
      else if (role === 'VENDOR') navigate('/vendor', { replace: true });
      else if (role === 'ADMIN')  navigate('/admin',  { replace: true });
      else                        navigate('/',       { replace: true });
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '40px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🚀</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#111827' }}>SwiftDrop</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Last-Mile Logistics Platform</p>
        </div>

        {justRegistered && (
          <div style={{
            background: '#d1fae5', border: '1px solid #6ee7b7',
            borderRadius: '8px', padding: '10px 14px',
            marginBottom: '16px', fontSize: '13px', color: '#065f46', fontWeight: 500,
          }}>
            ✅ Account created! Please sign in below.
          </div>
        )}

        {error && (
          <div role="alert" style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', padding: '10px 14px',
            marginBottom: '16px', fontSize: '13px', color: '#991b1b',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
              Email address
            </label>
            <input id="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
              Password
            </label>
            <input id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
          </div>

          <button type="submit" disabled={isLoading || !email || !password} style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '8px',
            fontSize: '15px', fontWeight: 600, fontFamily: 'inherit',
            cursor: isLoading || !email || !password ? 'not-allowed' : 'pointer',
            background: isLoading || !email || !password ? '#9ca3af' : '#1d4ed8',
            color: '#fff', transition: 'background 0.2s',
          }}>
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', marginTop: '16px' }}>
          New vendor or driver?{' '}
          <Link to="/signup" style={{ color: '#1d4ed8', fontWeight: 500, textDecoration: 'none' }}>
            Create an account
          </Link>
        </p>

        <div style={{
          marginTop: '16px', padding: '12px 14px',
          background: '#f9fafb', borderRadius: '8px',
          fontSize: '12px', color: '#6b7280', lineHeight: '1.7',
        }}>
          <strong style={{ color: '#374151', display: 'block', marginBottom: '3px' }}>
            Admin login
          </strong>
          admin@swiftdrop.io · Admin@123
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
