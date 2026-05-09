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
  { label: string; bg: string; color: string }
> = {
  PENDING:    { label: 'Pending',    bg: '#fef3c7', color: '#92400e' },
  ASSIGNED:   { label: 'Assigned',   bg: '#dbeafe', color: '#1e40af' },
  PICKED_UP:  { label: 'Picked Up',  bg: '#ede9fe', color: '#5b21b6' },
  IN_TRANSIT: { label: 'In Transit', bg: '#cffafe', color: '#155e75' },
  DELIVERED:  { label: 'Delivered',  bg: '#d1fae5', color: '#065f46' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const cfg = CONFIG[status] ?? { label: status, bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: cfg.bg,
        color: cfg.color,
        textTransform: 'uppercase',
      }}
    >
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
