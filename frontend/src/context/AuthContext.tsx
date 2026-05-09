/**
 * SwiftDrop :: Auth Context
 * =========================
 * Pattern : React Context + useReducer (Flux-like state management).
 * Role    : Global authentication state — token, role, userId.
 *           Provides login/logout actions to the entire component tree.
 *
 * Key design decisions
 * --------------------
 * 1. login() returns the UserRole so callers (LoginPage) don't need
 *    to touch localStorage directly — single source of truth.
 * 2. getInitialState() reads from localStorage so auth survives
 *    a page refresh without an extra API call.
 * 3. useMemo on context value prevents unnecessary re-renders of
 *    every consumer when an unrelated parent state changes.
 */
import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

import { AuthApi } from '../api/shipmentApi';
import type { AuthState, LoginRequest, UserRole } from '../types/shipment';

// ── State & Actions ────────────────────────────────────────────────────────────

type AuthAction =
  | { type: 'LOGIN'; token: string; role: UserRole; userId: string }
  | { type: 'LOGOUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return { token: action.token, role: action.role, userId: action.userId, isAuthenticated: true };
    case 'LOGOUT':
      return { token: null, role: null, userId: null, isAuthenticated: false };
    default:
      return state;
  }
}

/**
 * Read persisted auth from localStorage on first mount.
 * This ensures a page refresh doesn't log the user out.
 */
function getInitialState(): AuthState {
  const token  = localStorage.getItem('swiftdrop_token');
  const role   = localStorage.getItem('swiftdrop_role') as UserRole | null;
  const userId = localStorage.getItem('swiftdrop_user_id');
  return { token, role, userId, isAuthenticated: !!token };
}

// ── Context ────────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  /** Returns the authenticated user's role so callers can navigate without touching localStorage. */
  login: (payload: LoginRequest) => Promise<UserRole>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, undefined, getInitialState);

  const login = useCallback(async (payload: LoginRequest): Promise<UserRole> => {
    // AuthApi.login() sets localStorage synchronously before returning,
    // so on any subsequent mount (e.g. ProtectedRoute) getInitialState
    // will already find the correct role.
    const data = await AuthApi.login(payload);
    dispatch({
      type: 'LOGIN',
      token: data.access_token,
      role: data.role,
      userId: data.user_id,
    });
    // Return role so LoginPage can navigate without reading localStorage
    return data.role;
  }, []);

  const logout = useCallback(() => {
    AuthApi.logout();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
