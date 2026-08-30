import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage     from './pages/LandingPage/LandingPage';
import LoginPage       from './pages/LoginPage/LoginPage';
import SignupPage      from './pages/SignupPage/SignupPage';
import DriverDashboard from './pages/DriverDashboard/DriverDashboard';
import VendorDashboard from './pages/VendorDashboard/VendorDashboard';
import AdminDashboard  from './pages/AdminDashboard/AdminDashboard';
import ServerBanner    from './components/ServerBanner/ServerBanner';

// ── Route Guard ────────────────────────────────────────────────────────────────
interface ProtectedRouteProps {
  requiredRole: 'DRIVER' | 'VENDOR' | 'ADMIN';
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole, children }) => {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== requiredRole) {
    // Send each role to their correct dashboard
    if (role === 'DRIVER') return <Navigate to="/driver" replace />;
    if (role === 'VENDOR') return <Navigate to="/vendor" replace />;
    if (role === 'ADMIN')  return <Navigate to="/admin"  replace />;
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// ── Unknown-path redirect — sends each role somewhere useful ──────────────────
// Signed in, you land on your own dashboard; signed out, on the public landing
// page rather than a login form for a page you never asked for.
const RootRedirect: React.FC = () => {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated)      return <Navigate to="/"      replace />;
  if (role === 'DRIVER')     return <Navigate to="/driver" replace />;
  if (role === 'VENDOR')     return <Navigate to="/vendor" replace />;
  if (role === 'ADMIN')      return <Navigate to="/admin"  replace />;
  return <Navigate to="/login" replace />;
};

// ── App ────────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <AuthProvider>
    <BrowserRouter>
      {/* Starts waking the free-tier API before the user tries to sign in. */}
      <ServerBanner />
      <Routes>
        <Route path="/"       element={<LandingPage />} />
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route path="/driver" element={
          <ProtectedRoute requiredRole="DRIVER"><DriverDashboard /></ProtectedRoute>
        } />
        <Route path="/vendor" element={
          <ProtectedRoute requiredRole="VENDOR"><VendorDashboard /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="ADMIN"><AdminDashboard /></ProtectedRoute>
        } />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
