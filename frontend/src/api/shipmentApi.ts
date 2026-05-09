/**
 * SwiftDrop :: API Client (Repository Pattern)
 * All HTTP calls in one place. Zero business logic.
 * baseURL='' → Vite proxy forwards /api/* to :8000 in dev.
 */
import axios from 'axios';
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  BookShipmentRequest, LoginRequest,
  Shipment, ShipmentStatus, TokenResponse,
} from '../types/shipment';

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('swiftdrop_token');
  if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('swiftdrop_token');
      localStorage.removeItem('swiftdrop_role');
      localStorage.removeItem('swiftdrop_user_id');
      window.location.replace('/login');
    }
    return Promise.reject(error);
  },
);

// ── Auth ───────────────────────────────────────────────────────────────────────
export const AuthApi = {
  login: async (payload: LoginRequest): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>('/api/auth/login', payload);
    localStorage.setItem('swiftdrop_token',   data.access_token);
    localStorage.setItem('swiftdrop_role',    data.role);
    localStorage.setItem('swiftdrop_user_id', data.user_id);
    return data;
  },
  logout: (): void => {
    localStorage.removeItem('swiftdrop_token');
    localStorage.removeItem('swiftdrop_role');
    localStorage.removeItem('swiftdrop_user_id');
  },
};

// ── Signup ─────────────────────────────────────────────────────────────────────
export interface SignupRequest {
  full_name: string; email: string; password: string; phone: string;
  role: 'VENDOR' | 'DRIVER';
  company_name?: string; company_address?: string; gst_number?: string;
  vehicle_type?: string; vehicle_plate?: string; license_number?: string;
}
export interface SignupResponse { message: string; user_id: string; role: string; email: string; }

export const SignupApi = {
  signup: (data: SignupRequest): Promise<SignupResponse> =>
    api.post<SignupResponse>('/api/auth/signup', data).then((r) => r.data),
};

// ── Shipments ──────────────────────────────────────────────────────────────────
export interface ListShipmentsParams {
  status?: ShipmentStatus;
  page?:   number;
  limit?:  number;
}

export const ShipmentApi = {
  getShipments: (params: ShipmentStatus | ListShipmentsParams = {}): Promise<Shipment[]> => {
    // Backwards compatible: accepts a bare ShipmentStatus or a params object.
    const query: ListShipmentsParams =
      typeof params === 'string' ? { status: params } : params;
    return api.get<Shipment[]>('/api/shipments', { params: query }).then((r) => r.data);
  },

  searchShipments: (q: string, page = 1, limit = 20): Promise<Shipment[]> =>
    api.get<Shipment[]>('/api/shipments/search', { params: { q, page, limit } })
       .then((r) => r.data),

  getShipment: (id: string): Promise<Shipment> =>
    api.get<Shipment>(`/api/shipments/${id}`).then((r) => r.data),

  bookShipment: (data: BookShipmentRequest): Promise<Shipment> =>
    api.post<Shipment>('/api/shipments/book', data).then((r) => r.data),

  acceptShipment: (id: string): Promise<Shipment> =>
    api.put<Shipment>(`/api/shipments/${id}/accept`).then((r) => r.data),

  /** ASSIGNED → PICKED_UP */
  pickupShipment: (id: string): Promise<Shipment> =>
    api.put<Shipment>(`/api/shipments/${id}/pickup`).then((r) => r.data),

  /** PICKED_UP → IN_TRANSIT */
  transitShipment: (id: string): Promise<Shipment> =>
    api.put<Shipment>(`/api/shipments/${id}/transit`).then((r) => r.data),

  /**
   * IN_TRANSIT → DELIVERED
   * Calls CALL complete_delivery() stored procedure on the backend.
   * The procedure atomically updates shipment + driver in one DB call.
   */
  completeShipment: (id: string, finalFare?: number): Promise<Shipment> =>
    api.put<Shipment>(
      `/api/shipments/${id}/complete`,
      null,
      { params: finalFare ? { final_fare: finalFare } : undefined },
    ).then((r) => r.data),

  /** Vendor leaves a 1–5 review on a delivered shipment (Improvement 2). */
  reviewShipment: (id: string, rating: number, comment?: string): Promise<unknown> =>
    api.post(`/api/shipments/${id}/review`, { rating, comment }).then((r) => r.data),
};

// ── Notifications (Improvement 5 — Observer pattern inbox) ─────────────────────
export interface NotificationItem {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export const NotificationApi = {
  getMine: (page = 1, limit = 20, unread?: boolean): Promise<NotificationItem[]> =>
    api.get<NotificationItem[]>('/api/notifications/me', {
      params: { page, limit, ...(unread !== undefined ? { unread } : {}) },
    }).then((r) => r.data),

  markRead: (id: string): Promise<NotificationItem> =>
    api.post<NotificationItem>(`/api/notifications/${id}/read`).then((r) => r.data),

  markAllRead: (): Promise<{ status: string; result: string }> =>
    api.post<{ status: string; result: string }>('/api/notifications/read-all').then((r) => r.data),
};

// ── Drivers ────────────────────────────────────────────────────────────────────
export const DriverApi = {
  getMyProfile: (): Promise<Record<string, unknown>> =>
    api.get('/api/drivers/me').then((r) => r.data),

  setAvailability: (available: boolean): Promise<Record<string, unknown>> =>
    api.patch('/api/drivers/me/availability', null, { params: { available } })
       .then((r) => r.data),

  getDashboard: (): Promise<Record<string, unknown>[]> =>
    api.get('/api/drivers/dashboard').then((r) => r.data),
};

export default api;
