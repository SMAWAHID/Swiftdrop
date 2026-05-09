/**
 * SwiftDrop :: ActiveOrderCard
 * ==============================
 * Displays a shipment that has been accepted by this driver.
 * Shows the current status and the NEXT action button.
 *
 * State machine (mirroring the DB trigger):
 *   ASSIGNED  → [Mark Picked Up]  → PICKED_UP
 *   PICKED_UP → [Start Transit]   → IN_TRANSIT
 *   IN_TRANSIT→ [Complete Delivery (Stored Proc)] → DELIVERED
 *
 * The "Complete Delivery" button calls CALL complete_delivery()
 * via PUT /api/shipments/{id}/complete — a stored procedure
 * that atomically handles all delivery-completion logic in the DB.
 */
import React, { useState } from 'react';
import type { AxiosError } from 'axios';
import { ShipmentApi } from '../../api/shipmentApi';
import StatusBadge from '../StatusBadge/StatusBadge';
import type { Shipment } from '../../types/shipment';

interface ActiveOrderCardProps {
  shipment: Shipment;
  onUpdated: (updated: Shipment) => void;
}

const NEXT_ACTION: Record<string, { label: string; method: (id: string) => Promise<Shipment>; color: string }> = {
  ASSIGNED:   { label: '📦 Mark Picked Up',      method: ShipmentApi.pickupShipment,   color: '#7c3aed' },
  PICKED_UP:  { label: '🚗 Start Transit',        method: ShipmentApi.transitShipment,  color: '#0369a1' },
  IN_TRANSIT: { label: '✅ Complete Delivery',    method: ShipmentApi.completeShipment, color: '#15803d' },
};

function formatFare(amount: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
}

const ActiveOrderCard: React.FC<ActiveOrderCardProps> = ({ shipment, onUpdated }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const action = NEXT_ACTION[shipment.status];

  const handleAction = async () => {
    if (!action) return;
    setIsLoading(true);
    setError(null);
    try {
      const updated = await action.method(shipment.id);
      onUpdated(updated);
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      setError(axiosErr.response?.data?.detail ?? 'Action failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${shipment.status === 'DELIVERED' ? '#86efac' : '#e5e7eb'}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <StatusBadge status={shipment.status} />
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{shipment.shipment_type}</span>
      </div>

      {/* Route */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', marginTop: '3px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>PICKUP</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{shipment.pickup_address}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ef4444', marginTop: '3px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>DELIVERY</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{shipment.delivery_address}</div>
          </div>
        </div>
      </div>

      {/* Fare row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            {shipment.status === 'DELIVERED' ? 'Final Fare' : 'Estimated Fare'}
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
            {formatFare(Number(shipment.status === 'DELIVERED' ? (shipment.final_fare ?? shipment.estimated_fare) : shipment.estimated_fare))}
          </div>
        </div>

        {/* Action button — hidden when DELIVERED */}
        {action && shipment.status !== 'DELIVERED' && (
          <button
            onClick={handleAction}
            disabled={isLoading}
            style={{
              background: isLoading ? '#9ca3af' : action.color,
              color: '#fff', border: 'none', borderRadius: '8px',
              padding: '10px 18px', fontSize: '13px', fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {isLoading ? (
              <>
                <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'swiftdrop-spin 0.7s linear infinite' }} />
                Processing…
              </>
            ) : action.label}
          </button>
        )}

        {shipment.status === 'DELIVERED' && (
          <span style={{ fontSize: '20px' }}>🎉</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" style={{ marginTop: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#991b1b' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default ActiveOrderCard;
