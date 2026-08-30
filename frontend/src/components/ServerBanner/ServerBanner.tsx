/**
 * SwiftDrop :: ServerBanner
 * Explains a free-tier cold start instead of letting the app look frozen.
 * Renders nothing once the API answers.
 */
import React from 'react';
import { useServerWakeup } from '../../hooks/useServerWakeup';

const BAR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  padding: '10px 16px',
  fontSize: '13px',
  lineHeight: 1.4,
  textAlign: 'center',
};

const ServerBanner: React.FC = () => {
  const state = useServerWakeup();

  if (state === 'ready' || state === 'checking') return null;

  if (state === 'unreachable') {
    return (
      <div style={{ ...BAR, background: '#fef2f2', color: '#991b1b', borderBottom: '1px solid #fecaca' }} role="alert">
        <span>
          The SwiftDrop API isn&apos;t responding. It runs on a free tier that sleeps when
          idle — please reload in a minute.
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...BAR, background: '#fffbeb', color: '#92400e', borderBottom: '1px solid #fde68a' }} role="status">
      <span
        style={{
          width: 14,
          height: 14,
          border: '2px solid #fcd34d',
          borderTopColor: '#92400e',
          borderRadius: '50%',
          animation: 'swiftdrop-spin 0.7s linear infinite',
          flexShrink: 0,
        }}
      />
      <span>
        <strong>Waking the server up.</strong> The API sleeps after 15 minutes of
        inactivity on the free tier, so the first sign-in can take up to a minute.
      </span>
      <style>{`@keyframes swiftdrop-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ServerBanner;
