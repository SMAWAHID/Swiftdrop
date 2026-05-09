/**
 * SwiftDrop :: AdminDashboard
 * ============================
 * Shows all shipments and driver performance metrics.
 * Only accessible to ADMIN role.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { ShipmentApi, DriverApi } from '../../api/shipmentApi';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import type { Shipment } from '../../types/shipment';

interface RevenueRow {
  month_start:      string;
  shipment_type:    string;
  deliveries_count: number;
  total_revenue:    number;
  avg_fare:         number;
  total_weight_kg:  number;
}

interface DriverMetric {
  driver_id:             string;
  driver_name:           string;
  vehicle_type:          string;
  vehicle_plate:         string;
  is_available:          boolean;
  rating:                number;
  total_deliveries:      number;
  deliveries_this_month: number;
  avg_delivery_minutes:  number | null;
  total_revenue_generated: number;
  acceptance_rate_pct:   number | null;
}

type Tab = 'shipments' | 'drivers' | 'revenue';

const AdminDashboard: React.FC = () => {
  const navigate      = useNavigate();
  const { logout }    = useAuth();
  const [tab,         setTab]         = useState<Tab>('shipments');
  const [shipments,   setShipments]   = useState<Shipment[]>([]);
  const [drivers,     setDrivers]     = useState<DriverMetric[]>([]);
  const [revenue,     setRevenue]     = useState<RevenueRow[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [searchTerm,  setSearchTerm]  = useState<string>('');
  const [refreshing,  setRefreshing]  = useState<boolean>(false);

  const fetchShipments = useCallback(async (q?: string) => {
    try {
      setError(null);
      const data = q
        ? await ShipmentApi.searchShipments(q)            // FTS endpoint
        : await ShipmentApi.getShipments({ page: 1, limit: 50 }); // paginated
      setShipments(data);
    } catch { setError('Failed to load shipments.'); }
    finally   { setIsLoading(false); }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      setError(null);
      const rows = await DriverApi.getDashboard();
      setDrivers(rows as unknown as DriverMetric[]);
    } catch { setError('Failed to load driver metrics.'); }
    finally   { setIsLoading(false); }
  }, []);

  const fetchRevenue = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get<RevenueRow[]>('/api/drivers/revenue-summary');
      setRevenue(data);
    } catch { setError('Failed to load revenue summary.'); }
    finally   { setIsLoading(false); }
  }, []);

  const refreshRevenueView = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post('/api/drivers/revenue-summary/refresh');
      await fetchRevenue();
    } catch { setError('Failed to refresh materialized view.'); }
    finally  { setRefreshing(false); }
  }, [fetchRevenue]);

  useEffect(() => {
    setIsLoading(true);
    if      (tab === 'shipments') fetchShipments(searchTerm.trim() || undefined);
    else if (tab === 'drivers')   fetchDrivers();
    else                          fetchRevenue();
  }, [tab, fetchShipments, fetchDrivers, fetchRevenue, searchTerm]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const navBtn = (t: Tab, label: string) => (
    <button
      onClick={() => { setTab(t); setIsLoading(true); }}
      style={{
        padding: '8px 20px', border: 'none', borderRadius: '8px',
        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit', transition: 'all 0.15s',
        background: tab === t ? '#1d4ed8' : '#f3f4f6',
        color:      tab === t ? '#fff'    : '#6b7280',
      }}
    >{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <header style={{
        background: '#111827', padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚀</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#fff' }}>SwiftDrop</span>
          <span style={{ fontSize: '11px', background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
            ADMIN
          </span>
        </div>
        <button onClick={handleLogout} style={{
          background: 'transparent', border: '1px solid #374151',
          borderRadius: '8px', padding: '6px 14px', fontSize: '13px',
          cursor: 'pointer', color: '#9ca3af', fontFamily: 'inherit',
        }}>Logout</button>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {navBtn('shipments', '📦 All Shipments')}
          {navBtn('drivers',   '🚗 Driver Performance')}
          {navBtn('revenue',   '💰 Revenue (mat. view)')}
        </div>

        {tab === 'shipments' && (
          <div style={{ marginBottom: '14px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔎 Full-text search pickup / delivery address (Improvement 6)"
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb',
                borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit',
                background: '#fff',
              }}
            />
          </div>
        )}

        {error && (
          <div role="alert" style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b',
          }}>{error}</div>
        )}

        {isLoading && <LoadingSpinner label={`Loading ${tab}…`} />}

        {/* Shipments tab */}
        {!isLoading && tab === 'shipments' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>All Shipments</h2>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{shipments.length} total</span>
            </div>
            {shipments.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>No shipments yet.</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '10px 16px', background: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb', fontSize: '11px',
                  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
                }}>
                  <span>Route</span><span>Type</span><span>Weight</span><span>Fare</span><span>Status</span>
                </div>
                {shipments.map((s) => (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
                    fontSize: '13px', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, color: '#111827', marginBottom: '2px' }}>
                        {s.pickup_address}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>→ {s.delivery_address}</div>
                    </div>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{s.shipment_type}</span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{s.package_weight_kg} kg</span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>
                      PKR {Number(s.estimated_fare).toLocaleString()}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Revenue tab — backed by monthly_revenue_summary materialized view */}
        {!isLoading && tab === 'revenue' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>
                  Monthly Revenue Summary
                </h2>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                  Source: <code>monthly_revenue_summary</code> materialized view (Improvement 3)
                </span>
              </div>
              <button
                onClick={refreshRevenueView}
                disabled={refreshing}
                style={{
                  background: refreshing ? '#9ca3af' : '#1d4ed8', color: '#fff',
                  border: 'none', borderRadius: '8px', padding: '8px 14px',
                  fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                }}
              >
                {refreshing ? 'Refreshing…' : '↻ REFRESH MATERIALIZED VIEW'}
              </button>
            </div>
            {revenue.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>No delivered shipments yet.</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.2fr 1fr 1fr',
                  padding: '10px 16px', background: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb', fontSize: '11px',
                  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
                }}>
                  <span>Month</span><span>Type</span><span>Deliveries</span>
                  <span>Total Revenue</span><span>Avg Fare</span><span>Total Weight</span>
                </div>
                {revenue.map((r, i) => (
                  <div key={`${r.month_start}-${r.shipment_type}-${i}`} style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.2fr 1fr 1fr',
                    padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
                    fontSize: '13px', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 500, color: '#111827' }}>{r.month_start}</span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{r.shipment_type}</span>
                    <span>{r.deliveries_count}</span>
                    <span style={{ fontWeight: 600 }}>PKR {Number(r.total_revenue).toLocaleString()}</span>
                    <span>PKR {Number(r.avg_fare).toLocaleString()}</span>
                    <span>{Number(r.total_weight_kg).toFixed(2)} kg</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Driver performance tab */}
        {!isLoading && tab === 'drivers' && (
          <>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>
              Driver Performance Dashboard
            </h2>
            {drivers.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>No drivers registered yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {drivers.map((d) => (
                  <div key={d.driver_id} style={{
                    background: '#fff', border: '1px solid #e5e7eb',
                    borderRadius: '12px', padding: '16px 20px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{d.driver_name}</span>
                        <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
                          {d.vehicle_type} · {d.vehicle_plate}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 600,
                        background: d.is_available ? '#d1fae5' : '#fee2e2',
                        color:      d.is_available ? '#065f46' : '#991b1b',
                        padding: '3px 10px', borderRadius: '999px',
                      }}>
                        {d.is_available ? 'Available' : 'Busy'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {[
                        ['Rating',       `⭐ ${d.rating ?? 'N/A'}`],
                        ['Total Deliveries', d.total_deliveries],
                        ['This Month',   d.deliveries_this_month],
                        ['Revenue',      `PKR ${Number(d.total_revenue_generated).toLocaleString()}`],
                        ['Avg Time',     d.avg_delivery_minutes ? `${d.avg_delivery_minutes} min` : 'N/A'],
                        ['Accept Rate',  d.acceptance_rate_pct  ? `${d.acceptance_rate_pct}%`   : 'N/A'],
                      ].map(([label, value]) => (
                        <div key={String(label)} style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '3px' }}>{label}</div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
