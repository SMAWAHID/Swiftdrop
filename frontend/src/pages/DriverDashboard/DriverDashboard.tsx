/**
 * SwiftDrop :: DriverDashboard
 * ============================
 * Two sections:
 *   1. PENDING orders — accept new work (useShipment hook)
 *   2. MY ACTIVE orders — progress through the delivery state machine
 *      ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
 *      "Complete Delivery" calls CALL complete_delivery() stored procedure.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShipment } from '../../hooks/useShipment';
import { ShipmentApi, DriverApi, NotificationApi } from '../../api/shipmentApi';
import type { NotificationItem } from '../../api/shipmentApi';
import { useAuth } from '../../context/AuthContext';
import OrderCard from '../../components/OrderCard/OrderCard';
import ActiveOrderCard from '../../components/ActiveOrderCard/ActiveOrderCard';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import type { Shipment } from '../../types/shipment';

const DriverDashboard: React.FC = () => {
  const navigate   = useNavigate();
  const { logout } = useAuth();

  // PENDING shipments — accept new work
  const { shipments: pending, isLoading: pendingLoading, error, acceptingId,
          acceptShipment, refresh: refreshPending, clearError } = useShipment({
    statusFilter: 'PENDING', pollInterval: 15_000,
  });

  // MY active shipments (ASSIGNED, PICKED_UP, IN_TRANSIT)
  const [active,       setActive]       = useState<Shipment[]>([]);
  const [isAvailable,  setIsAvailable]  = useState(true);
  const [togglingAvail,setTogglingAvail]= useState(false);

  // Observer pattern inbox — populated by NotificationService events
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showInbox,     setShowInbox]     = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const items = await NotificationApi.getMine(1, 20);
      setNotifications(items);
    } catch { /* non-critical */ }
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchActive = useCallback(async () => {
    try {
      // Get all my assigned/in-progress shipments
      const all = await ShipmentApi.getShipments();
      const myActive = all.filter(s =>
        ['ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED'].includes(s.status)
      );
      setActive(myActive);
    } catch { /* silent */ }
    finally { /* done */ }
  }, []);

  useEffect(() => {
    fetchActive();
    fetchNotifications();
    // Load real availability
    DriverApi.getMyProfile()
      .then(p => { if (typeof p.is_available === 'boolean') setIsAvailable(p.is_available); })
      .catch(() => {});
    const interval = setInterval(() => { fetchActive(); fetchNotifications(); }, 20_000);
    return () => clearInterval(interval);
  }, [fetchActive, fetchNotifications]);

  // When a shipment status is updated via ActiveOrderCard, update local state
  const handleShipmentUpdated = (updated: Shipment) => {
    setActive(prev => prev.map(s => s.id === updated.id ? updated : s));
    // Refresh pending list too (in case driver is now unavailable)
    refreshPending();
  };

  const toggleAvailability = useCallback(async () => {
    setTogglingAvail(true);
    try {
      await DriverApi.setAvailability(!isAvailable);
      setIsAvailable(p => !p);
    } catch { /* non-critical */ }
    finally { setTogglingAvail(false); }
  }, [isAvailable]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const inProgress = active.filter(s => s.status !== 'DELIVERED');
  const delivered  = active.filter(s => s.status === 'DELIVERED');

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ── */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 20px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🚀</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>SwiftDrop</span>
          <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>DRIVER</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          <button
            onClick={async () => {
              const next = !showInbox;
              setShowInbox(next);
              if (next) {
                await fetchNotifications();
                if (unreadCount > 0) {
                  try { await NotificationApi.markAllRead(); fetchNotifications(); } catch { /* ignore */ }
                }
              }
            }}
            title="Notifications"
            style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', color: '#374151', fontFamily: 'inherit', position: 'relative' }}>
            🔔
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '10px', fontWeight: 700, padding: '1px 5px' }}>
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => { refreshPending(); fetchActive(); fetchNotifications(); }}
            style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
            ↻
          </button>
          <button onClick={handleLogout}
            style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit' }}>
            Logout
          </button>
          {showInbox && (
            <div style={{ position: 'absolute', right: 0, top: '40px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', padding: '8px', width: '320px', maxHeight: '400px', overflowY: 'auto', zIndex: 20 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', padding: '4px 8px', textTransform: 'uppercase' }}>
                Notifications (Observer pattern)
              </div>
              {notifications.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#9ca3af', padding: '12px', textAlign: 'center' }}>No notifications yet.</div>
              ) : notifications.map(n => (
                <div key={n.id} style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                  <div style={{ fontWeight: 600, color: '#111827', marginBottom: '2px' }}>{n.event_type}</div>
                  <div style={{ color: '#6b7280' }}>{(n.payload?.message as string) ?? ''}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Stats Row ── */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Available Orders</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#111827' }}>{pendingLoading ? '…' : pending.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>In Progress</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#111827' }}>{inProgress.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>Status</div>
            <button onClick={toggleAvailability} disabled={togglingAvail}
              style={{ background: isAvailable ? '#d1fae5' : '#fee2e2', color: isAvailable ? '#065f46' : '#991b1b', border: 'none', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: togglingAvail ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {togglingAvail ? '…' : isAvailable ? '🟢 Available' : '🔴 Busy'}
            </button>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{error}</span>
            <button onClick={clearError} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#b91c1c', padding: 0 }}>×</button>
          </div>
        )}

        {/* ── Active Orders (In Progress) ── */}
        {inProgress.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#111827' }}>🚚 My Active Deliveries</h2>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>tap to progress status</span>
            </div>
            {inProgress.map(s => (
              <ActiveOrderCard key={s.id} shipment={s} onUpdated={handleShipmentUpdated} />
            ))}
          </>
        )}

        {/* ── Pending Orders ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', marginTop: inProgress.length ? '20px' : 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#111827' }}>📦 Available Orders</h2>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>refreshes every 15s</span>
        </div>

        {pendingLoading && <LoadingSpinner label="Loading orders…" />}

        {!pendingLoading && pending.map(s => (
          <OrderCard key={s.id} shipment={s} onAccept={acceptShipment} isAccepting={acceptingId === s.id} />
        ))}

        {!pendingLoading && pending.length === 0 && !error && inProgress.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
            <p style={{ fontSize: '15px', fontWeight: 500, color: '#6b7280', margin: '0 0 4px' }}>No pending orders right now</p>
            <p style={{ fontSize: '12px', margin: 0 }}>New orders appear automatically every 15 seconds.</p>
          </div>
        )}

        {/* ── Recent Delivered ── */}
        {delivered.length > 0 && (
          <>
            <div style={{ marginTop: '24px', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#111827' }}>✅ Completed Today</h2>
            </div>
            {delivered.slice(0, 3).map(s => (
              <ActiveOrderCard key={s.id} shipment={s} onUpdated={handleShipmentUpdated} />
            ))}
          </>
        )}
      </main>
    </div>
  );
};

export default DriverDashboard;
