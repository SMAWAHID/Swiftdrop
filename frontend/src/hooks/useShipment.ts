/**
 * SwiftDrop :: useShipment Custom Hook
 * =====================================
 * Pattern : Custom Hook = Model layer in component-level MVC.
 * Role    : Owns all shipment data-fetching state, polling logic,
 *           and the accept mutation with optimistic UI updates.
 *
 * High Cohesion : One concern — shipment data & mutations.
 * Low Coupling  : Components receive data/callbacks via return value;
 *                 they never call the API directly.
 *
 * Polling
 * -------
 * Fetches shipments every `pollInterval` ms.
 * Interval ref is cleaned up on unmount to prevent memory leaks.
 *
 * Optimistic UI
 * -------------
 * On accept, the card is removed from the list before the server
 * confirms. On error, the list is refreshed to restore truth.
 *
 * Concurrency — 409 Conflict
 * --------------------------
 * Backend uses SELECT FOR UPDATE NOWAIT. If the row is locked,
 * it returns 409. We show a user-friendly message — the driver
 * simply picks another order.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AxiosError } from 'axios';

import { ShipmentApi } from '../api/shipmentApi';
import type { Shipment, ShipmentStatus } from '../types/shipment';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UseShipmentOptions {
  /** Status filter passed to the API. Defaults to 'PENDING'. */
  statusFilter?: ShipmentStatus;
  /** Polling interval in ms. Set to 0 to disable. Default: 15000. */
  pollInterval?: number;
}

export interface UseShipmentReturn {
  shipments:      Shipment[];
  isLoading:      boolean;
  error:          string | null;
  /** UUID of the shipment currently being accepted (for per-card spinner). */
  acceptingId:    string | null;
  acceptShipment: (id: string) => Promise<void>;
  refresh:        () => void;
  clearError:     () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useShipment(options: UseShipmentOptions = {}): UseShipmentReturn {
  const { statusFilter = 'PENDING', pollInterval = 15_000 } = options;

  const [shipments,   setShipments]   = useState<Shipment[]>([]);
  const [isLoading,   setIsLoading]   = useState<boolean>(true);
  const [error,       setError]       = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchShipments = useCallback(async () => {
    try {
      setError(null);
      const data = await ShipmentApi.getShipments(statusFilter);
      setShipments(data);
    } catch {
      setError('Unable to load shipments. Will retry automatically.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchShipments();

    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchShipments, pollInterval);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchShipments, pollInterval]);

  // ── Accept mutation ────────────────────────────────────────────────────────

  const acceptShipment = useCallback(
    async (id: string) => {
      setAcceptingId(id);
      setError(null);

      // Optimistic update: remove card immediately for instant feedback
      setShipments((prev) => prev.filter((s) => s.id !== id));

      try {
        await ShipmentApi.acceptShipment(id);
        // Success — card already removed optimistically.
      } catch (err) {
        const axiosErr = err as AxiosError<{ detail: string }>;
        const detail   = axiosErr.response?.data?.detail;

        if (axiosErr.response?.status === 409) {
          // Row-level lock contention: another driver was faster.
          setError(
            detail ?? 'Order no longer available — another driver just accepted it.',
          );
        } else {
          setError(detail ?? 'Failed to accept order. Please try again.');
          // Revert optimistic update — restore true server state
          await fetchShipments();
        }
      } finally {
        setAcceptingId(null);
      }
    },
    [fetchShipments],
  );

  return {
    shipments,
    isLoading,
    error,
    acceptingId,
    acceptShipment,
    refresh:    fetchShipments,
    clearError: () => setError(null),
  };
}
