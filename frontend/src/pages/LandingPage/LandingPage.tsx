import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * SwiftDrop :: Landing Page
 * The public front door. `/` used to redirect straight to /login, which meant
 * anyone arriving at the site was asked for credentials before being told what
 * the product was.
 */

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: '14px',
  padding: '22px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: '1px solid #eef2f7',
};

const ROLES = [
  {
    icon: '🏪',
    title: 'Vendors',
    body: 'Book a shipment in one form, watch it move through pickup and transit, and rate the driver once it lands.',
  },
  {
    icon: '🚚',
    title: 'Drivers',
    body: 'Claim jobs from a live queue, advance delivery status from the road, and build a rating that follows you.',
  },
  {
    icon: '📊',
    title: 'Admins',
    body: 'Watch revenue roll up through a materialised view, and audit every status change from the trigger log.',
  },
];

const ENGINEERING = [
  {
    title: 'No double-assigned jobs',
    body: 'Two drivers accepting the same shipment at the same moment is resolved in the database with SELECT … FOR UPDATE NOWAIT, not by hoping the race never happens.',
  },
  {
    title: 'Status changes cannot skip steps',
    body: 'A PL/pgSQL trigger validates every transition, so a shipment can never jump from PENDING to DELIVERED — and every change is written to an audit log.',
  },
  {
    title: 'Ratings that recompute themselves',
    body: 'Leaving a review fires a trigger that recalculates the driver average in the same transaction, so the number is never stale.',
  },
];

const DEMO_ACCOUNTS = [
  { role: 'Vendor', email: 'alice@vendor.com' },
  { role: 'Driver', email: 'bob@driver.com' },
  { role: 'Admin', email: 'admin@swiftdrop.io' },
];

const LandingPage: React.FC = () => {
  const { isAuthenticated, role } = useAuth();

  const dashboardPath =
    role === 'DRIVER' ? '/driver' : role === 'VENDOR' ? '/vendor' : role === 'ADMIN' ? '/admin' : '/login';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
        fontFamily: 'inherit',
      }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: '1px solid #e5e7eb',
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: '1040px',
            margin: '0 auto',
            padding: '0 24px',
            height: '58px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🚀</span>
            <span style={{ fontWeight: 700, color: '#111827', fontSize: '16px' }}>SwiftDrop</span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a
              href="https://github.com/SMAWAHID/Swiftdrop"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}
            >
              Source
            </a>
            {isAuthenticated ? (
              <Link
                to={dashboardPath}
                style={{
                  fontSize: '13px', fontWeight: 600, color: '#fff', background: '#1d4ed8',
                  padding: '8px 14px', borderRadius: '8px', textDecoration: 'none',
                }}
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" style={{ fontSize: '13px', color: '#374151', textDecoration: 'none' }}>
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  style={{
                    fontSize: '13px', fontWeight: 600, color: '#fff', background: '#1d4ed8',
                    padding: '8px 14px', borderRadius: '8px', textDecoration: 'none',
                  }}
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '760px', margin: '0 auto', padding: '72px 24px 48px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block', fontSize: '12px', fontWeight: 600, color: '#1d4ed8',
            background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: '999px',
            padding: '5px 12px', marginBottom: '22px',
          }}
        >
          Real-time last-mile logistics
        </div>

        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, color: '#0f172a',
            lineHeight: 1.12, letterSpacing: '-0.02em', margin: 0, textWrap: 'balance',
          }}
        >
          Book a delivery. Watch a driver take it.
        </h1>

        <p
          style={{
            fontSize: '17px', color: '#475569', lineHeight: 1.6,
            margin: '20px auto 0', maxWidth: '560px',
          }}
        >
          SwiftDrop connects vendors who need packages moved with drivers who can move them —
          with concurrency handled where it actually matters, in the database.
        </p>

        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '10px',
            justifyContent: 'center', marginTop: '30px',
          }}
        >
          <Link
            to={isAuthenticated ? dashboardPath : '/signup'}
            style={{
              background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: '14px',
              padding: '12px 22px', borderRadius: '10px', textDecoration: 'none',
            }}
          >
            {isAuthenticated ? 'Go to dashboard' : 'Create an account'}
          </Link>
          <Link
            to="/login"
            style={{
              background: '#fff', color: '#374151', fontWeight: 600, fontSize: '14px',
              padding: '12px 22px', borderRadius: '10px', textDecoration: 'none',
              border: '1px solid #d1d5db',
            }}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* ── Roles ────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 56px' }}>
        <div
          style={{
            display: 'grid', gap: '14px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          {ROLES.map((r) => (
            <div key={r.title} style={CARD}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>{r.icon}</div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
                {r.title}
              </h2>
              <p style={{ fontSize: '13.5px', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Engineering ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 56px' }}>
        <h2
          style={{
            fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.14em', color: '#94a3b8', textAlign: 'center',
            margin: '0 0 22px',
          }}
        >
          What is actually going on underneath
        </h2>
        <div
          style={{
            display: 'grid', gap: '14px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {ENGINEERING.map((e) => (
            <div key={e.title} style={CARD}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                {e.title}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65, margin: 0 }}>{e.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo accounts ────────────────────────────────────────────────── */}
      {!isAuthenticated && (
        <section style={{ maxWidth: '620px', margin: '0 auto', padding: '0 24px 64px' }}>
          <div style={{ ...CARD, padding: '26px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
              Try it without signing up
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: 1.6 }}>
              These accounts come preloaded with shipments, drivers and reviews. Password for
              all three is <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>Admin@123</code>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {DEMO_ACCOUNTS.map((a) => (
                <div
                  key={a.email}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '12px', fontSize: '13px', background: '#f8fafc',
                    border: '1px solid #eef2f7', borderRadius: '8px', padding: '9px 12px',
                  }}
                >
                  <span style={{ color: '#64748b', fontWeight: 600 }}>{a.role}</span>
                  <code style={{ color: '#334155' }}>{a.email}</code>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer
        style={{
          borderTop: '1px solid #e5e7eb', padding: '20px 24px',
          textAlign: 'center', fontSize: '12px', color: '#94a3b8',
        }}
      >
        SwiftDrop · FastAPI + PostgreSQL + React · 3NF schema, PL/pgSQL triggers, row-level locking
      </footer>
    </div>
  );
};

export default LandingPage;
