import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  api,
  apiErrorMessage,
  resetSessionInvalidNotice,
  setSessionInvalidHandler,
} from '../services/api';
import {
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
} from '../services/notifications';
import { useLanguage } from './LanguageContext';
import { AppLanguage } from '../i18n/translations';

interface User {
  _id?: string;
  id: string;
  login: string;
  full_name: string;
  role: string;
  email?: string;
  phone?: string;
  branch_id?: string;
  is_active?: boolean;
  two_factor_enabled?: boolean;
  language_preference?: AppLanguage;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  pushToken: string | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeUser = (user: User): User => ({
  ...user,
  _id: user._id || user.id,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setLanguage, isLanguageReady, t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const clearLocalSession = useCallback(async (notice?: string) => {
    delete api.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
    setPushToken(null);
    if (notice) setSessionNotice(notice);
    await AsyncStorage.multiRemove(['user', 'token', 'pushToken']);
  }, []);

  useEffect(() => {
    setSessionInvalidHandler((message) => {
      void clearLocalSession(t(message));
    });
    return () => setSessionInvalidHandler(null);
  }, [clearLocalSession, t]);

  // Register push token when user is authenticated
  useEffect(() => {
    if (user && token && !user.must_change_password) {
      setupPushNotifications();
    }
  }, [user, token]);

  const setupPushNotifications = async () => {
    try {
      // Skip on web
      if (Platform.OS === 'web') {
        console.log('Push notifications not supported on web');
        return;
      }

      // Get push token
      const expoPushToken = await registerForPushNotifications();
      
      if (expoPushToken) {
        setPushToken(expoPushToken);
        await AsyncStorage.setItem('pushToken', expoPushToken);
        
        // Register with backend
        const registered = await registerPushToken(expoPushToken, Platform.OS);
        if (registered) {
          console.log('Push token registered successfully');
        }
      }
    } catch (error) {
      console.error('Error setting up push notifications:', error);
    }
  };

  const loadStoredAuth = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedPushToken = await AsyncStorage.getItem('pushToken');

      if (storedToken) {
        setToken(storedToken);
        api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
        try {
          const response = await api.get('/auth/me');
          const currentUser = normalizeUser(response.data);
          setUser(currentUser);
          if (currentUser.language_preference) {
            await setLanguage(currentUser.language_preference);
          }
          await AsyncStorage.setItem('user', JSON.stringify(currentUser));
        } catch (error) {
          console.error('Stored auth token is no longer valid:', error);
          await clearLocalSession();
        }
      } else {
        // A cached user record is display data, never proof of identity.
        // Clearing the whole local session prevents an account mismatch after
        // database resets, revoked tokens, or partially-cleared browser data.
        await clearLocalSession();
      }
      
      if (storedToken && storedPushToken) {
        setPushToken(storedPushToken);
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  }, [clearLocalSession, setLanguage]);

  useEffect(() => {
    if (isLanguageReady) loadStoredAuth();
  }, [isLanguageReady, loadStoredAuth]);

  const login = async (phoneInput: string, password: string) => {
    try {
      const phone = phoneInput.trim();
      const response = await api.post('/auth/login', {
        phone,
        // Production resolves the normalized phone field. The duplicate
        // legacy field keeps disposable QA aliases usable only when the
        // backend explicitly enables its test-only compatibility gate.
        login: phone,
        password,
      });

      const accessToken = response.data.access_token;
      const loggedInUser = normalizeUser(response.data.user);

      resetSessionInvalidNotice();
      setSessionNotice(null);
      setToken(accessToken);
      setUser(loggedInUser);
      if (loggedInUser.language_preference) {
        await setLanguage(loggedInUser.language_preference);
      }
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      await AsyncStorage.setItem('token', accessToken);
      await AsyncStorage.setItem('user', JSON.stringify(loggedInUser));
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Login failed'));
    }
  };

  const logout = async () => {
    try {
      if (pushToken) {
        await unregisterPushToken(pushToken);
      }
      
      resetSessionInvalidNotice();
      setSessionNotice(null);
      await clearLocalSession();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const currentUser = normalizeUser(response.data);
      setUser(currentUser);
      if (currentUser.language_preference) {
        await setLanguage(currentUser.language_preference);
      }
      await AsyncStorage.setItem('user', JSON.stringify(currentUser));
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      pushToken,
      login,
      logout,
      refreshUser,
      sessionNotice,
      clearSessionNotice: () => setSessionNotice(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
