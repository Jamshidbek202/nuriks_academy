import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Keep a server-backed screen current while it is visible. */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  enabled: boolean,
  refreshKey = '',
  intervalMs = 5000,
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      // Reading the key makes group/filter changes restart this focus effect.
      void refreshKey;

      const runRefresh = () => {
        void refreshRef.current();
      };

      runRefresh();
      const timer = setInterval(runRefresh, intervalMs);
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') runRefresh();
      });

      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          runRefresh();
        }
      };

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', runRefresh);
      }

      return () => {
        clearInterval(timer);
        appStateSubscription.remove();
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('focus', runRefresh);
        }
      };
    }, [enabled, refreshKey, intervalMs]),
  );
}
