/**
 * SwiftDrop :: LoadingSpinner Component
 * Pure CSS spinner — no external icon library dependency.
 */
import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  label?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 32,
  color = '#1d4ed8',
  label = 'Loading…',
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '40px 0',
    }}
    role="status"
    aria-label={label}
  >
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid #e5e7eb`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'swiftdrop-spin 0.7s linear infinite',
      }}
    />
    <style>{`
      @keyframes swiftdrop-spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
    <span style={{ fontSize: '13px', color: '#6b7280' }}>{label}</span>
  </div>
);

export default LoadingSpinner;
