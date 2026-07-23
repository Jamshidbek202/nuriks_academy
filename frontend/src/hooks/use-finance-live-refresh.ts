import { useEffect, useRef } from 'react';

import { API_URL } from '../services/api';
import { useLiveRefresh } from './use-live-refresh';

/**
 * Refresh a finance projection after committed MongoDB changes. A slower timed
 * refresh remains active as reconciliation fallback if live transport drops.
 */
export function useFinanceLiveRefresh(
  refresh: () => void | Promise<void>,
  token: string | null,
  enabled: boolean,
  refreshKey = '',
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Reconcile periodically even when the WebSocket is healthy. This protects
  // the screen from missed invalidations during sleep or network transitions.
  useLiveRefresh(refresh, enabled, refreshKey, 10_000);

  useEffect(() => {
    if (!enabled || !token || typeof WebSocket === 'undefined') return undefined;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let reconnectDelayMs = 500;

    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      // One transaction may emit several collection changes. Apply one complete
      // server snapshot after the commit instead of rendering partial bursts.
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshRef.current();
      }, 100);
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`${API_URL.replace(/\/$/, '')}/api/finance/live-ticket`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Could not create finance live ticket');
        const { ticket } = await response.json();
        if (stopped) return;
        const websocketBase = API_URL.replace(/^http/i, 'ws').replace(/\/$/, '');
        socket = new WebSocket(`${websocketBase}/api/finance/live?ticket=${encodeURIComponent(ticket)}`);
      } catch {
        if (stopped) return;
        reconnectTimer = setTimeout(() => void connect(), reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
        return;
      }

      socket.onopen = () => {
        reconnectDelayMs = 500;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'finance_changed') queueRefresh();
        } catch {
          // Invalid messages never replace the last verified finance snapshot.
        }
      };
      socket.onclose = () => {
        socket = null;
        if (stopped) return;
        reconnectTimer = setTimeout(() => void connect(), reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    void connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      socket?.close();
    };
  }, [enabled, refreshKey, token]);
}
