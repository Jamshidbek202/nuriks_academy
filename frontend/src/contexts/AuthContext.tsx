import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from '../services/api';
import {
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
} from '../services/notifications';

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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  pushToken: string | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeUser = (user: User): User => ({
  ...user,
  _id: user._id || user.id,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Register push token when user is authenticated
  useEffect(() => {
    if (user && token) {
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

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');
      const storedPushToken = await AsyncStorage.getItem('pushToken');

      if (storedToken) {
        setToken(storedToken);
        api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
        try {
          const response = await api.get('/auth/me');
          const currentUser = normalizeUser(response.data);
          setUser(currentUser);
          await AsyncStorage.setItem('user', JSON.stringify(currentUser));
        } catch (error) {
          console.error('Stored auth token is no longer valid:', error);
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          delete api.defaults.headers.common.Authorization;
          setToken(null);
          setUser(null);
        }
      } else if (storedUser) {
        setUser(normalizeUser(JSON.parse(storedUser)));
      }
      
      if (storedPushToken) {
        setPushToken(storedPushToken);
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (loginInput: string, password: string) => {
    try {
      const trimmedLogin = loginInput.trim();
      const trimmedPassword = password.trim();
      const response = await api.post('/auth/login', {
        login: trimmedLogin,
        password: trimmedPassword,
      });

      const accessToken = response.data.access_token;
      const loggedInUser = normalizeUser(response.data.user);

      setToken(accessToken);
      setUser(loggedInUser);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      await AsyncStorage.setItem('token', accessToken);
      await AsyncStorage.setItem('user', JSON.stringify(loggedInUser));
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || error.message || 'Login failed');
    }
  };

  const logout = async () => {
    try {
      if (pushToken) {
        await unregisterPushToken(pushToken);
      }
      
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('pushToken');
      
      setToken(null);
      setUser(null);
      setPushToken(null);
      delete api.defaults.headers.common.Authorization;
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const currentUser = normalizeUser(response.data);
      setUser(currentUser);
      await AsyncStorage.setItem('user', JSON.stringify(currentUser));
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, pushToken, login, logout, refreshUser }}>
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
