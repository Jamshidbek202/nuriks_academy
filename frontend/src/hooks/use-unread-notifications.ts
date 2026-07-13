import { useState } from 'react';
import { api } from '../services/api';
import { useLiveRefresh } from './use-live-refresh';

export function useUnreadNotifications() {
  const [count, setCount] = useState(0);

  const loadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count', { params: { _: Date.now() } });
      setCount(response.data.count || 0);
    } catch {
      // Keep the last known count during a temporary network failure.
    }
  };

  useLiveRefresh(loadCount, true, 'notification-unread-count');
  return count;
}
