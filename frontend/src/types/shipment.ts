/**
 * SwiftDrop :: TypeScript Type Definitions
 * These mirror the Pydantic response schemas from the FastAPI backend.
 * Single source of truth for data shapes across the frontend (DRY principle).
 */

export type ShipmentStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED';

export type ShipmentType = 'STANDARD' | 'EXPRESS' | 'FRAGILE';

export type UserRole = 'VENDOR' | 'DRIVER' | 'ADMIN';

// ── API Response Shapes ────────────────────────────────────────────────────────

export interface Shipment {
  id: string;
  vendor_id: string;
  driver_id: string | null;
  shipment_type: ShipmentType;
  status: ShipmentStatus;
  pickup_address: string;
  delivery_address: string;
  package_weight_kg: number;
  package_description: string | null;
  estimated_fare: number;
  final_fare: number | null;
  created_at: string;     // ISO-8601 datetime string from backend
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  user_id: string;
}

// ── API Request Shapes ─────────────────────────────────────────────────────────

export interface BookShipmentRequest {
  shipment_type: ShipmentType;
  pickup_address: string;
  delivery_address: string;
  package_weight_kg: number;
  package_description?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ── UI State Shapes ────────────────────────────────────────────────────────────

export interface AuthState {
  token: string | null;
  role: UserRole | null;
  userId: string | null;
  isAuthenticated: boolean;
}
