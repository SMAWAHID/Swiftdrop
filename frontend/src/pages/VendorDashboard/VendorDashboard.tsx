/**
 * SwiftDrop :: VendorDashboard Page
 * ====================================
 * Role    : Vendor-facing view for booking and tracking shipments.
 *
 * Fix applied: fetchShipments wrapped in useCallback so the
 * setInterval inside useEffect always holds a stable reference.
 * Without useCallback, every render creates a new function object,
 * causing the effect to re-run and the interval to reset continuously.
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';

import { ShipmentApi } from '../../api/shipmentApi';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import type { Shipment, ShipmentType } from '../../types/shipment';

// ── Book Form State ────────────────────────────────────────────────────────────

interface BookForm {
  shipment_type:       ShipmentType;
  pickup_address:      string;
  delivery_address:    string;
  package_weight_kg:   string;
  package_description: string;
}

const INITIAL_FORM: BookForm = {
  shipment_type:       'STANDARD',
  pickup_address:      '',
  delivery_address:    '',
  package_weight_kg:   '',
  package_description: '',
};

// ── Shared inline styles ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: '#374151', marginBottom: '5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px',
  border: '1px solid #d1d5db', borderRadius: '7px',
  fontSize: '13px', boxSizing: 'border-box',
  outline: 'none', background: '#fff', fontFamily: 'inherit',
};

// ── Component ──────────────────────────────────────────────────────────────────

const VendorDashboard: React.FC = () => {
  const navigate   = useNavigate();
  const { logout } = useAuth();

  const [shipments,     setShipments]     = useState<Shipment[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError,     setListError]     = useState<string | null>(null);
  const [form,          setForm]          = useState<BookForm>(INITIAL_FORM);
  const [isBooking,     setIsBooking]     = useState(false);
  const [bookError,     setBookError]     = useState<string | null>(null);
  const [bookSuccess,   setBookSuccess]   = useState<string | null>(null);
  const [showForm,      setShowForm]      = useState(false);

  // ── Fetch shipments ──────────────────────────────────────────────────────────
  // useCallback gives fetchShipments a stable reference across renders,
  // so setInterval in useEffect does not get stale closures.

  const fetchShipments = useCallback(async () => {
    try {
      setListError(null);
      const data = await ShipmentApi.getShipments();
      setShipments(data);
    } catch {
      setListError('Failed to load your shipments.');
    } finally {
      setIsLoadingList(false);
    }
  }, []); // no deps — ShipmentApi is a stable module-level object

  useEffect(() => {
    fetchShipments();
    const interval = setInterval(fetchShipments, 20_000);
    return () => clearInterval(interval);
  }, [fetchShipments]);

  // ── Book shipment ────────────────────────────────────────────────────────────

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    setBookError(null);
    setBookSuccess(null);
    setIsBooking(true);

    try {
      const weight = parseFloat(form.package_weight_kg);
      if (isNaN(weight) || weight <= 0) {
        setBookError('Package weight must be a positive number.');
        setIsBooking(false);
        return;
      }

      const newShipment = await ShipmentApi.bookShipment({
        shipment_type:       form.shipment_type,
        pickup_address:      form.pickup_address.trim(),
        delivery_address:    form.delivery_address.trim(),
        package_weight_kg:   weight,
        package_description: form.package_description.trim() || undefined,
      });

      setBookSuccess(
        `✅ Booked! ID: ${newShipment.id.slice(0, 8)}… · Fare: PKR ${Number(newShipment.estimated_fare).toLocaleString()}`,
      );
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchShipments();
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      setBookError(axiosErr.response?.data?.detail ?? 'Failed to book shipment.');
    } finally {
      setIsBooking(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleToggleForm = () => {
    setShowForm((p) => !p);
    setBookError(null);
    setBookSuccess(null);
  };

  // ── Review modal state (Improvement 2) ──────────────────────────────────────
  const [reviewFor, setReviewFor] = useState<Shipment | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const submitReview = async () => {
    if (!reviewFor) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      await ShipmentApi.reviewShipment(reviewFor.id, reviewRating, reviewComment.trim() || undefined);
      setReviewFor(null);
      setReviewRating(5);
      setReviewComment('');
    } catch (err) {
      const ax = err as AxiosError<{ detail: string }>;
      setReviewError(ax.response?.data?.detail ?? 'Failed to submit review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* ── Top Navigation Bar ── */}
      <header
        style={{
          background: '#ffffff', borderBottom: '1px solid #e5e7eb',
          padding: '0 20px', height: '56px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🚀</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>SwiftDrop</span>
          <span
            style={{
              fontSize: '11px', background: '#d1fae5', color: '#065f46',
              padding: '2px 8px', borderRadius: '999px', fontWeight: 600,
            }}
          >
            VENDOR
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleToggleForm}
            style={{
              background: showForm ? '#6b7280' : '#1d4ed8',
              color: '#fff', border: 'none', borderRadius: '8px',
              padding: '7px 16px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {showForm ? '✕ Cancel' : '+ New Shipment'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent', border: '1px solid #e5e7eb',
              borderRadius: '8px', padding: '7px 14px',
              fontSize: '13px', cursor: 'pointer', color: '#6b7280',
              fontFamily: 'inherit',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Book Form ── */}
        {showForm && (
          <div
            style={{
              background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: '12px', padding: '24px',
              marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
              Book New Shipment
            </h2>

            {bookError && (
              <div
                role="alert"
                style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: '8px', padding: '10px 14px',
                  marginBottom: '16px', fontSize: '13px', color: '#991b1b',
                }}
              >
                {bookError}
              </div>
            )}

            <form onSubmit={handleBook} noValidate>
              {/* Type */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Shipment Type</label>
                <select
                  value={form.shipment_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shipment_type: e.target.value as ShipmentType }))
                  }
                  style={inputStyle}
                >
                  <option value="STANDARD">📦 Standard (1–3 days)</option>
                  <option value="EXPRESS">⚡ Express (Same day · 1.8× fare)</option>
                  <option value="FRAGILE">⚠️ Fragile (Special handling · 2.2× fare)</option>
                </select>
              </div>

              {/* Addresses */}
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}
              >
                <div>
                  <label style={labelStyle}>Pickup Address</label>
                  <input
                    value={form.pickup_address}
                    onChange={(e) => setForm((f) => ({ ...f, pickup_address: e.target.value }))}
                    required
                    minLength={5}
                    placeholder="e.g. Saddar, Karachi"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Delivery Address</label>
                  <input
                    value={form.delivery_address}
                    onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                    required
                    minLength={5}
                    placeholder="e.g. Defence Phase 6, Karachi"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Weight + Description */}
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '20px' }}
              >
                <div>
                  <label style={labelStyle}>Weight (kg)</label>
                  <input
                    type="number"
                    value={form.package_weight_kg}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, package_weight_kg: e.target.value }))
                    }
                    required
                    min={0.1}
                    step={0.1}
                    placeholder="e.g. 1.5"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description (optional)</label>
                  <input
                    value={form.package_description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, package_description: e.target.value }))
                    }
                    placeholder="e.g. Laptop in padded box"
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isBooking}
                style={{
                  background: isBooking ? '#9ca3af' : '#1d4ed8',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '11px 28px', fontSize: '14px', fontWeight: 600,
                  cursor: isBooking ? 'not-allowed' : 'pointer',
                  width: '100%', fontFamily: 'inherit',
                }}
              >
                {isBooking ? 'Booking…' : 'Confirm Booking'}
              </button>
            </form>
          </div>
        )}

        {/* Success banner */}
        {bookSuccess && (
          <div
            style={{
              background: '#d1fae5', border: '1px solid #6ee7b7',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
              fontSize: '13px', color: '#065f46', fontWeight: 500,
            }}
          >
            {bookSuccess}
          </div>
        )}

        {/* Section heading */}
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>
            Your Shipments
          </h2>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{shipments.length} total</span>
        </div>

        {listError && (
          <div
            role="alert"
            style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
              padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b',
            }}
          >
            {listError}
          </div>
        )}

        {isLoadingList && <LoadingSpinner label="Loading shipments…" />}

        {/* Shipment list */}
        {!isLoadingList && shipments.length > 0 && (
          <div
            style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}
          >
            {shipments.map((s, idx) => (
              <div
                key={s.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx < shipments.length - 1 ? '1px solid #f3f4f6' : 'none',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', marginBottom: '3px' }}>
                    {s.pickup_address} → {s.delivery_address}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {s.shipment_type} · {s.package_weight_kg} kg · PKR {Number(s.estimated_fare).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge status={s.status} />
                  {s.status === 'DELIVERED' && (
                    <button
                      onClick={() => { setReviewFor(s); setReviewRating(5); setReviewComment(''); setReviewError(null); }}
                      style={{
                        background: '#fbbf24', color: '#78350f', border: 'none',
                        borderRadius: '8px', padding: '6px 10px', fontSize: '11px',
                        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      ⭐ Rate driver
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoadingList && shipments.length === 0 && !listError && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
            <p style={{ fontSize: '15px', fontWeight: 500, color: '#6b7280', margin: '0 0 6px' }}>
              No shipments yet
            </p>
            <p style={{ fontSize: '13px', margin: 0 }}>
              Click "+ New Shipment" to create your first order.
            </p>
          </div>
        )}
      </main>

      {/* ── Review modal (Improvement 2 — auto-rating triggers) ── */}
      {reviewFor && (
        <div
          onClick={() => setReviewFor(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '20px',
              width: '90%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>
              Rate driver
            </h3>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px' }}>
              {reviewFor.pickup_address} → {reviewFor.delivery_address}
            </div>

            <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReviewRating(n)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: '28px', padding: '4px',
                    color: n <= reviewRating ? '#fbbf24' : '#d1d5db',
                  }}
                  aria-label={`${n} stars`}
                >★</button>
              ))}
            </div>

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Optional comment (max 1000 chars)"
              rows={3}
              maxLength={1000}
              style={{
                width: '100%', padding: '10px', border: '1px solid #d1d5db',
                borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
                boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px',
              }}
            />

            {reviewError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#991b1b',
              }}>
                {reviewError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setReviewFor(null)}
                disabled={reviewSubmitting}
                style={{
                  background: 'transparent', border: '1px solid #e5e7eb',
                  borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
                  cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit',
                }}
              >Cancel</button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                style={{
                  background: reviewSubmitting ? '#9ca3af' : '#1d4ed8', color: '#fff',
                  border: 'none', borderRadius: '8px', padding: '8px 18px',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {reviewSubmitting ? 'Submitting…' : 'Submit review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
