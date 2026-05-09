/**
 * SwiftDrop :: OrderCard Component
 * ==================================
 * Role    : Pure presentational component (View in MVC).
 * Design  : Zero internal state. All data and behaviour flows in
 *           via props (unidirectional data flow).
 *
 * Low Coupling  : No API calls — receives data and callbacks from parent.
 * High Cohesion : One responsibility — render a single shipment card.
 * Testability   : Pure component; trivially snapshot-testable.
 *
 * Accept Button
 * -------------
 * Visible only when status === 'PENDING'.
 * Disabled while `isAccepting` is true (prevents double-submit).
 * The click handler calls `onAccept(shipment.id)` — the actual
 * HTTP call lives in the useShipment hook (separation of concerns).
 */
import React from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import type { Shipment, ShipmentType } from '../../types/shipment';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderCardProps {
  shipment: Shipment;
  /** Called when the driver taps "Accept Order". */
  onAccept: (id: string) => void;
  /** True while THIS specific card's accept request is in-flight. */
  isAccepting: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ShipmentType, string> = {
  STANDARD: '📦 Standard',
  EXPRESS: '⚡ Express',
  FRAGILE: '⚠️ Fragile',
};

const TYPE_BADGE_COLOR: Record<ShipmentType, string> = {
  STANDARD: '#6b7280',
  EXPRESS: '#d97706',
  FRAGILE: '#dc2626',
};

function formatFare(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ── Component ──────────────────────────────────────────────────────────────────

const OrderCard: React.FC<OrderCardProps> = ({
  shipment,
  onAccept,
  isAccepting,
}) => {
  const typeLabel = TYPE_LABELS[shipment.shipment_type] ?? shipment.shipment_type;
  const typeBadgeColor = TYPE_BADGE_COLOR[shipment.shipment_type] ?? '#6b7280';

  return (
    <article
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
      aria-label={`Shipment from ${shipment.pickup_address} to ${shipment.delivery_address}`}
    >
      {/* ── Header row ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <StatusBadge status={shipment.status} />

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: typeBadgeColor,
            background: typeBadgeColor + '18',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {typeLabel}
        </span>
      </div>

      {/* ── Address block ── */}
      <div style={{ marginBottom: '14px' }}>
        {/* Pickup */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#10b981',
              marginTop: '3px',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '1px' }}>
              PICKUP
            </div>
            <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>
              {shipment.pickup_address}
            </div>
          </div>
        </div>

        {/* Connector line */}
        <div
          style={{
            marginLeft: '4px',
            width: '2px',
            height: '12px',
            background: '#d1d5db',
            marginBottom: '8px',
          }}
        />

        {/* Delivery */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              background: '#ef4444',
              marginTop: '3px',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '1px' }}>
              DELIVERY
            </div>
            <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>
              {shipment.delivery_address}
            </div>
          </div>
        </div>
      </div>

      {/* ── Meta row ── */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          fontSize: '12px',
          color: '#6b7280',
          marginBottom: '14px',
          flexWrap: 'wrap',
        }}
      >
        <span>⚖️ {shipment.package_weight_kg} kg</span>
        {shipment.package_description && (
          <span title={shipment.package_description}>
            📝 {shipment.package_description.slice(0, 40)}
            {shipment.package_description.length > 40 ? '…' : ''}
          </span>
        )}
        <span>🕐 {formatDate(shipment.created_at)}</span>
      </div>

      {/* ── Footer: fare + accept button ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '12px',
          borderTop: '1px solid #f3f4f6',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Estimated Fare</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            {formatFare(shipment.estimated_fare)}
          </div>
        </div>

        {/* Accept button — only rendered for PENDING shipments */}
        {shipment.status === 'PENDING' && (
          <button
            onClick={() => onAccept(shipment.id)}
            disabled={isAccepting}
            aria-busy={isAccepting}
            style={{
              background: isAccepting ? '#9ca3af' : '#1d4ed8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 22px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isAccepting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s, transform 0.1s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: '130px',
              justifyContent: 'center',
            }}
          >
            {isAccepting ? (
              <>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'swiftdrop-spin 0.7s linear infinite',
                  }}
                />
                Accepting…
              </>
            ) : (
              'Accept Order'
            )}
          </button>
        )}
      </div>
    </article>
  );
};

export default OrderCard;
