import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_COLORS, T } from '../../theme';

/**
 * SwiftDrop :: Landing Page
 * The public front door. `/` used to redirect straight to /login, which meant
 * anyone arriving at the site was asked for credentials before being told what
 * the product was.
 */

const ROLES = [
  {
    key: 'VENDOR' as const,
    icon: '🏪',
    title: 'Vendors',
    body: 'Book a shipment in one form, watch it move through pickup and transit, and rate the driver once it lands.',
  },
  {
    key: 'DRIVER' as const,
    icon: '🚚',
    title: 'Drivers',
    body: 'Claim jobs from a live queue, advance delivery status from the road, and build a rating that follows you.',
  },
  {
    key: 'ADMIN' as const,
    icon: '📊',
    title: 'Admins',
    body: 'Watch revenue roll up through a materialised view, and audit every status change from the trigger log.',
  },
];

const ENGINEERING = [
  {
    title: 'No double-assigned jobs',
    code: 'SELECT … FOR UPDATE NOWAIT',
    accent: T.teal,
    body: 'Two drivers accepting the same shipment at the same moment is resolved in the database with SELECT … FOR UPDATE NOWAIT, not by hoping the race never happens.',
  },
  {
    title: 'Status changes cannot skip steps',
    code: 'PL/pgSQL trigger',
    accent: '#a78bfa',
    body: 'A PL/pgSQL trigger validates every transition, so a shipment can never jump from PENDING to DELIVERED — and every change is written to an audit log.',
  },
  {
    title: 'Ratings that recompute themselves',
    code: 'AFTER INSERT trigger',
    accent: T.orange,
    body: 'Leaving a review fires a trigger that recalculates the driver average in the same transaction, so the number is never stale.',
  },
];

const DEMO_ACCOUNTS = [
  { role: 'Vendor', key: 'VENDOR' as const, email: 'alice@vendor.com' },
  { role: 'Driver', key: 'DRIVER' as const, email: 'bob@driver.com' },
  { role: 'Admin', key: 'ADMIN' as const, email: 'admin@swiftdrop.io' },
];

/** The five statuses a shipment moves through, in order, for the hero's tracker card. */
const STEPS = [
  { label: 'Pending', color: T.amber },
  { label: 'Assigned', color: '#60a5fa' },
  { label: 'Picked up', color: '#a78bfa' },
  { label: 'In transit', color: T.orange },
  { label: 'Delivered', color: '#34d399' },
];

const WRAP: React.CSSProperties = { maxWidth: '1080px', margin: '0 auto', padding: '0 24px' };

const LandingPage: React.FC = () => {
  const { isAuthenticated, role } = useAuth();

  const dashboardPath =
    role === 'DRIVER' ? '/driver' : role === 'VENDOR' ? '/vendor' : role === 'ADMIN' ? '/admin' : '/login';

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'inherit', background: '#f6f5ff' }}>
      {/* ── Hero (dark, with colour glows) ───────────────────────────────── */}
      <div style={{ background: T.gradHero, color: '#fff' }}>
        <header
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(11,23,54,0.55)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div
            style={{
              ...WRAP,
              height: '62px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span
                style={{
                  width: '32px', height: '32px', borderRadius: '9px', display: 'grid', placeItems: 'center',
                  background: T.gradAccent, fontSize: '17px', boxShadow: '0 6px 18px -6px rgba(249,115,22,0.8)',
                }}
              >
                🚀
              </span>
              <span style={{ fontWeight: 800, fontSize: '17px', letterSpacing: '-0.01em' }}>SwiftDrop</span>
            </div>

            <nav style={{ display: 'flex', alignItems: 'center', gap: '14px', whiteSpace: 'nowrap' }}>
              <a
                href="https://github.com/SMAWAHID/Swiftdrop"
                target="_blank"
                rel="noopener noreferrer"
                className="sd-link"
                style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}
              >
                Source
              </a>
              {isAuthenticated ? (
                <Link
                  to={dashboardPath}
                  className="sd-btn"
                  style={{
                    fontSize: '13px', fontWeight: 700, color: '#fff', background: T.gradPrimary,
                    padding: '9px 15px', borderRadius: '10px', textDecoration: 'none',
                  }}
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="sd-link" style={{ fontSize: '13px', color: '#fff', textDecoration: 'none' }}>
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="sd-btn"
                    style={{
                      fontSize: '13px', fontWeight: 700, color: '#fff', background: T.gradPrimary,
                      padding: '9px 15px', borderRadius: '10px', textDecoration: 'none',
                    }}
                  >
                    Get started
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <section style={{ maxWidth: '820px', margin: '0 auto', padding: '76px 24px 40px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700,
              color: '#fed7aa', background: 'rgba(249,115,22,0.14)', border: '1px solid rgba(249,115,22,0.4)',
              borderRadius: '999px', padding: '6px 13px', marginBottom: '24px', letterSpacing: '0.02em',
            }}
          >
            <span className="sd-pulse" style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.orange }} />
            Real-time last-mile logistics
          </div>

          <h1
            style={{
              fontSize: 'clamp(32px, 5.4vw, 54px)', fontWeight: 800, lineHeight: 1.08,
              letterSpacing: '-0.03em', margin: 0, textWrap: 'balance',
            }}
          >
            Book a delivery.{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, #fb923c 0%, #fbbf24 60%, #fde68a 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}
            >
              Watch a driver take it.
            </span>
          </h1>

          <p
            style={{
              fontSize: '17px', color: 'rgba(226,232,255,0.82)', lineHeight: 1.65,
              margin: '22px auto 0', maxWidth: '580px',
            }}
          >
            SwiftDrop connects vendors who need packages moved with drivers who can move them —
            with concurrency handled where it actually matters, in the database.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
            <Link
              to={isAuthenticated ? dashboardPath : '/signup'}
              className="sd-btn"
              style={{
                background: T.gradAccent, color: '#fff', fontWeight: 700, fontSize: '14px',
                padding: '13px 24px', borderRadius: '12px', textDecoration: 'none',
                boxShadow: '0 12px 30px -12px rgba(249,115,22,0.9)',
              }}
            >
              {isAuthenticated ? 'Go to dashboard' : 'Create an account'}
            </Link>
            <Link
              to="/login"
              className="sd-btn"
              style={{
                background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, fontSize: '14px',
                padding: '13px 24px', borderRadius: '12px', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.22)',
              }}
            >
              Sign in
            </Link>
          </div>
        </section>

        {/* Live-shipment tracker card */}
        <section style={{ maxWidth: '720px', margin: '0 auto', padding: '8px 24px 64px' }}>
          <div
            aria-hidden="true"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '18px', padding: '22px 24px', backdropFilter: 'blur(8px)',
              boxShadow: '0 30px 60px -30px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(226,232,255,0.7)' }}>
              <span>📦 Shipment #SD-2041</span>
              <span style={{ color: '#fdba74', fontWeight: 700 }}>● Live</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '26px 0 22px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#93c5fd', whiteSpace: 'nowrap' }}>Pickup</span>
              <div style={{ position: 'relative', flex: 1, height: '2px' }} className="sd-route">
                <span className="sd-truck" style={{ fontSize: '22px', transform: 'scaleX(-1)', display: 'inline-block' }}>
                  🚚
                </span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#6ee7b7', whiteSpace: 'nowrap' }}>Drop-off</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {STEPS.map((s) => (
                <span
                  key={s.label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700,
                    padding: '5px 10px', borderRadius: '999px', color: '#fff',
                    background: `${s.color}26`, border: `1px solid ${s.color}80`,
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Roles ────────────────────────────────────────────────────────── */}
      <section style={{ ...WRAP, padding: '64px 24px 24px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '26px', fontWeight: 800, color: T.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          One platform, three dashboards
        </h2>
        <p style={{ textAlign: 'center', color: T.muted, fontSize: '15px', margin: '0 0 30px' }}>
          Everyone sees exactly what they need, the moment it changes.
        </p>
        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {ROLES.map((r) => {
            const c = ROLE_COLORS[r.key];
            return (
              <div
                key={r.title}
                className="sd-card"
                style={{
                  background: `linear-gradient(180deg, ${c.soft} 0%, #ffffff 65%)`,
                  border: `1px solid ${c.ring}`, borderTop: `4px solid ${c.main}`,
                  borderRadius: '16px', padding: '24px',
                }}
              >
                <div
                  style={{
                    width: '46px', height: '46px', borderRadius: '13px', display: 'grid', placeItems: 'center',
                    background: c.main, fontSize: '22px', marginBottom: '14px',
                    boxShadow: `0 10px 22px -10px ${c.main}`,
                  }}
                >
                  {r.icon}
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: c.ink, margin: '0 0 6px' }}>{r.title}</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65, margin: 0 }}>{r.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Engineering (dark band) ──────────────────────────────────────── */}
      <section style={{ background: T.gradBand, margin: '56px 0 0', padding: '64px 0' }}>
        <div style={WRAP}>
          <h2
            style={{
              fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.16em', color: '#c4b5fd', textAlign: 'center', margin: '0 0 10px',
            }}
          >
            What is actually going on underneath
          </h2>
          <p style={{ textAlign: 'center', color: 'rgba(226,232,255,0.75)', fontSize: '15px', margin: '0 0 30px' }}>
            The hard parts live in PostgreSQL, where they can't be raced or skipped.
          </p>
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {ENGINEERING.map((e) => (
              <div
                key={e.title}
                className="sd-card"
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  borderLeft: `4px solid ${e.accent}`, borderRadius: '14px', padding: '22px',
                }}
              >
                <code
                  style={{
                    display: 'inline-block', fontSize: '11px', fontWeight: 700, color: e.accent,
                    background: 'rgba(255,255,255,0.07)', padding: '3px 8px', borderRadius: '6px', marginBottom: '12px',
                  }}
                >
                  {e.code}
                </code>
                <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>{e.title}</h3>
                <p style={{ fontSize: '13.5px', color: 'rgba(226,232,255,0.78)', lineHeight: 1.65, margin: 0 }}>{e.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo accounts ────────────────────────────────────────────────── */}
      {!isAuthenticated && (
        <section style={{ maxWidth: '640px', margin: '0 auto', padding: '64px 24px' }}>
          <div
            style={{
              background: '#fff', borderRadius: '18px', padding: '28px', border: '1px solid #e9e5ff',
              boxShadow: '0 24px 50px -30px rgba(30,27,75,0.35)', position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: '0 0 auto 0', height: '4px', background: 'linear-gradient(90deg, #f97316, #2563eb, #7c3aed)' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: T.text, margin: '0 0 6px' }}>Try it without signing up</h2>
            <p style={{ fontSize: '13.5px', color: T.muted, margin: '0 0 18px', lineHeight: 1.6 }}>
              These accounts come preloaded with shipments, drivers and reviews. Password for
              all three is{' '}
              <code style={{ background: '#f3edff', color: T.violet, padding: '2px 6px', borderRadius: '5px', fontWeight: 700 }}>
                Admin@123
              </code>
              .
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {DEMO_ACCOUNTS.map((a) => {
                const c = ROLE_COLORS[a.key];
                return (
                  <div
                    key={a.email}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '12px', fontSize: '13px', background: c.soft,
                      border: `1px solid ${c.ring}`, borderRadius: '10px', padding: '10px 13px',
                    }}
                  >
                    <span
                      style={{
                        color: '#fff', background: c.main, fontWeight: 700, fontSize: '11.5px',
                        padding: '3px 10px', borderRadius: '999px',
                      }}
                    >
                      {a.role}
                    </span>
                    <code style={{ color: c.ink, fontWeight: 600 }}>{a.email}</code>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer
        style={{
          background: T.ink, padding: '22px 24px', textAlign: 'center', fontSize: '12.5px',
          color: 'rgba(226,232,255,0.6)',
        }}
      >
        SwiftDrop · FastAPI + PostgreSQL + React · 3NF schema, PL/pgSQL triggers, row-level locking
      </footer>
    </div>
  );
};

export default LandingPage;
