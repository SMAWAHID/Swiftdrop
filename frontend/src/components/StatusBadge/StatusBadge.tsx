/**
 * SwiftDrop :: StatusBadge Component
 * Pure presentational atom — zero state, zero side-effects.
 * Maps a ShipmentStatus string to a colour-coded pill badge.
 */
import React from 'react';
import type { ShipmentStatus } from '../../types/shipment';

interface StatusBadgeProps {
  status: ShipmentStatus;
}

const CONFIG: Record<
  ShipmentStatus,
  { label: string; bg: string; color: string; dot: string }
> = {
  PENDING:    { label: 'Pending',    bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  ASSIGNED:   { label: 'Assigned',   bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  PICKED_UP:  { label: 'Picked Up',  bg: '#ede9fe', color: '#5b21b6', dot: '#8b5cf6' },
  IN_TRANSIT: { label: 'In Transit', bg: '#ffedd5', color: '#9a3412', dot: '#f97316' },
  DELIVERED:  { label: 'Delivered',  bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const cfg = CONFIG[status] ?? { label: status, bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.dot}55`,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot }} />
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
