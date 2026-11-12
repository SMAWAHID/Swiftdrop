/**
 * SwiftDrop :: Colour tokens
 * One place for the palette so pages stay consistent. Inline styles import from here.
 */
export const T = {
  ink: '#0b1736',
  indigo: '#1e1b4b',
  blue: '#2563eb',
  violet: '#7c3aed',
  orange: '#f97316',
  amber: '#f59e0b',
  teal: '#14b8a6',
  text: '#0f172a',
  muted: '#64748b',

  gradPrimary: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  gradAccent: 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)',
  gradPage: 'linear-gradient(180deg, #f3f5ff 0%, #f7f3ff 45%, #fff6ee 100%)',
  gradHero:
    'radial-gradient(60% 80% at 12% 0%, rgba(124,58,237,0.55), transparent 60%),' +
    'radial-gradient(45% 60% at 90% 15%, rgba(249,115,22,0.38), transparent 60%),' +
    'radial-gradient(60% 70% at 55% 110%, rgba(37,99,235,0.55), transparent 60%),' +
    '#0b1736',
  gradBand: 'linear-gradient(135deg, #0b1736 0%, #1e1b4b 55%, #312e81 100%)',
} as const;

/** Each role gets its own colour, used on cards, badges and dashboard headers. */
export const ROLE_COLORS = {
  VENDOR: { main: '#f97316', soft: '#fff3e8', ring: '#fed7aa', ink: '#9a3412' },
  DRIVER: { main: '#2563eb', soft: '#eaf1ff', ring: '#bfdbfe', ink: '#1e3a8a' },
  ADMIN: { main: '#7c3aed', soft: '#f3edff', ring: '#ddd6fe', ink: '#4c1d95' },
} as const;
