import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { api } from '../services/api';
import { WebNotificationToast, WebToastNotification } from '../components/WebNotificationToast';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [webToasts, setWebToasts] = useState<WebToastNotification[]>([]);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);
  const appState = useRef(AppState.currentState);
  const router = useRouter();
  const { user, pushToken } = useAuth();
  const userId = user?.id || user?._id;
  const knownWebNotificationIds = useRef(new Set<string>());
  const webInboxInitialized = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Set the push token from auth context
    if (pushToken) {
      setExpoPushToken(pushToken);
    }

    // Listen for incoming notifications (when app is open)
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      setNotification(notification);
      setUnreadCount(prev => prev + 1);
    });

    // Listen for notification taps (when user interacts with notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      handleNotificationNavigation(response.notification);
    });

    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription.remove();
    };
  }, [pushToken]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !userId) {
      setWebToasts([]);
      knownWebNotificationIds.current.clear();
      webInboxInitialized.current = false;
      return undefined;
    }

    let cancelled = false;
    const pollInbox = async () => {
      try {
        const response = await api.get('/notifications', {
          params: { sort: 'newest', limit: 30, _: Date.now() },
        });
        if (cancelled) return;

        const inbox = response.data as WebToastNotification[];
        if (!webInboxInitialized.current) {
          inbox.forEach((item) => knownWebNotificationIds.current.add(item.id));
          webInboxInitialized.current = true;
          return;
        }

        const arrivals = inbox.filter((item) => !knownWebNotificationIds.current.has(item.id));
        inbox.forEach((item) => knownWebNotificationIds.current.add(item.id));
        if (arrivals.length > 0) {
          // Reverse API's newest-first order so simultaneous events animate chronologically.
          setWebToasts((current) => [...current, ...arrivals.reverse()].slice(-4));
        }
      } catch (error) {
        console.error('Unable to check for new web notifications:', error);
      }
    };

    void pollInbox();
    const timer = setInterval(pollInbox, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - check for pending notifications
      const badge = await Notifications.getBadgeCountAsync();
      setUnreadCount(badge);
    }
    appState.current = nextAppState;
  };

  const handleNotificationNavigation = (notification: Notifications.Notification) => {
    const data = notification.request.content.data;
    
    if (!data || !user) return;

    const notificationType = data.type as string;
    
    // Navigate based on notification type
    switch (notificationType) {
      case 'homework':
      case 'homework_assigned':
        router.push('/(dashboard)/homework');
        break;
        
      case 'payment':
      case 'payment_reminder':
        router.push('/(dashboard)/payments');
        break;
        
      case 'test':
      case 'test_scheduled':
        router.push('/(dashboard)/tests');
        break;
        
      case 'news':
      case 'news_announcement':
        router.push('/(dashboard)/news');
        break;
        
      case 'chat':
      case 'chat_message':
        const conversationId = data.conversation_id as string;
        if (conversationId) {
          router.push(`/chat/${conversationId}`);
        } else {
          router.push('/(dashboard)/chats');
        }
        break;
        
      case 'lesson_reminder':
        router.push('/(dashboard)');
        break;
        
      case 'certificate':
        router.push('/(dashboard)/certificates');
        break;
        
      case 'attendance':
        router.push('/(dashboard)/attendance');
        break;
        
      default:
        // Default to dashboard
        router.push('/(dashboard)');
        break;
    }
    
    // Clear badge count after navigation
    Notifications.setBadgeCountAsync(0);
    setUnreadCount(0);
  };

  return (
    <NotificationContext.Provider 
      value={{ 
        expoPushToken, 
        notification, 
        unreadCount, 
        setUnreadCount 
      }}
    >
      {children}
      {Platform.OS === 'web' && webToasts.map((toast, index) => (
        <WebNotificationToast
          key={toast.id}
          notification={toast}
          index={index}
          onDismiss={(id) => setWebToasts((current) => current.filter((item) => item.id !== id))}
        />
      ))}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
