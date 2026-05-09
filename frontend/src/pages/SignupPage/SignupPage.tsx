/**
 * SwiftDrop :: SignupPage
 * ========================
 * Self-registration for Vendors and Drivers.
 * Admin accounts cannot be created here (seeded only).
 * Form dynamically shows role-specific fields based on
 * the selected role toggle.
 */
import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { SignupApi } from '../../api/shipmentApi';
import type { SignupRequest } from '../../api/shipmentApi';

type Role = 'VENDOR' | 'DRIVER';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: '8px',
  fontSize: '14px', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px',
  fontWeight: 500, color: '#374151', marginBottom: '5px',
};

const SignupPage: React.FC = () => {
  const navigate = useNavigate();

  const [role,          setRole]          = useState<Role>('VENDOR');
  const [fullName,      setFullName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [phone,         setPhone]         = useState('');
  // Vendor fields
  const [companyName,   setCompanyName]   = useState('');
  const [companyAddr,   setCompanyAddr]   = useState('');
  const [gstNumber,     setGstNumber]     = useState('');
  // Driver fields
  const [vehicleType,   setVehicleType]   = useState('');
  const [vehiclePlate,  setVehiclePlate]  = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const payload: SignupRequest = {
      full_name: fullName.trim(),
      email:     email.trim(),
      password,
      phone:     phone.trim(),
      role,
      ...(role === 'VENDOR' ? {
        company_name:    companyName.trim(),
        company_address: companyAddr.trim(),
        gst_number:      gstNumber.trim() || undefined,
      } : {
        vehicle_type:   vehicleType.trim(),
        vehicle_plate:  vehiclePlate.trim().toUpperCase(),
        license_number: licenseNumber.trim(),
      }),
    };

    try {
      await SignupApi.signup(payload);
      // After signup, redirect to login with a success hint
      navigate('/login?registered=1', { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      setError(axiosErr.response?.data?.detail ?? 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px',
          padding: '36px', width: '100%', maxWidth: '480px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '32px', marginBottom: '6px' }}>🚀</div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#111827' }}>
            Create Your Account
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            SwiftDrop — Last-Mile Logistics
          </p>
        </div>

        {/* Role toggle */}
        <div
          style={{
            display: 'flex', background: '#f3f4f6',
            borderRadius: '10px', padding: '4px',
            marginBottom: '20px',
          }}
        >
          {(['VENDOR', 'DRIVER'] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRole(r); setError(null); }}
              style={{
                flex: 1, padding: '8px 0', border: 'none',
                borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: role === r ? '#1d4ed8' : 'transparent',
                color:      role === r ? '#fff'    : '#6b7280',
              }}
            >
              {r === 'VENDOR' ? '📦 Vendor' : '🚗 Driver'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div role="alert" style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', padding: '10px 14px',
            marginBottom: '16px', fontSize: '13px', color: '#991b1b',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Common fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                required minLength={2} placeholder="Ali Hassan" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                required placeholder="+923001234567" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="you@example.com" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={6} placeholder="Min. 6 characters" style={inputStyle} />
          </div>

          {/* Vendor-specific fields */}
          {role === 'VENDOR' && (
            <div
              style={{
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: '10px', padding: '14px', marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af', margin: '0 0 10px' }}>
                📦 Vendor Details
              </p>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Company Name</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  required placeholder="e.g. Ali Electronics" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Company Address</label>
                <input value={companyAddr} onChange={(e) => setCompanyAddr(e.target.value)}
                  required placeholder="e.g. Saddar, Karachi" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>GST Number (optional)</label>
                <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="GST-XXXXXXXXX" style={inputStyle} />
              </div>
            </div>
          )}

          {/* Driver-specific fields */}
          {role === 'DRIVER' && (
            <div
              style={{
                background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: '10px', padding: '14px', marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#15803d', margin: '0 0 10px' }}>
                🚗 Driver Details
              </p>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Vehicle Type</label>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}
                  required style={inputStyle}>
                  <option value="">Select type…</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Car">Car</option>
                  <option value="Van">Van</option>
                  <option value="Truck">Truck</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Vehicle Plate</label>
                  <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)}
                    required placeholder="KHI-1234" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>License Number</label>
                  <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)}
                    required placeholder="LIC-XXX-000" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%', padding: '12px', border: 'none',
              borderRadius: '8px', fontSize: '15px', fontWeight: 600,
              fontFamily: 'inherit', cursor: isLoading ? 'not-allowed' : 'pointer',
              background: isLoading ? '#9ca3af' : '#1d4ed8', color: '#fff',
              transition: 'background 0.2s',
            }}
          >
            {isLoading ? 'Creating account…' : `Create ${role === 'VENDOR' ? 'Vendor' : 'Driver'} Account`}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', marginTop: '16px', margin: '16px 0 0' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#1d4ed8', fontWeight: 500, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
