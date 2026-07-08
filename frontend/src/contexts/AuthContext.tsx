import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase, type SupabaseUserProfile } from '../services/supabase';
import {
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
} from '../services/notifications';

interface User extends SupabaseUserProfile {}

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await hydrateSession(session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
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
      const storedUser = await AsyncStorage.getItem('user');
      const storedPushToken = await AsyncStorage.getItem('pushToken');

      const { data } = await supabase.auth.getSession();
      await hydrateSession(data.session);

      if (storedUser && !data.session) {
        setUser(JSON.parse(storedUser));
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

  const hydrateSession = async (session: Session | null) => {
    if (!session?.access_token) {
      setToken(null);
      setUser(null);
      return;
    }

    setToken(session.access_token);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, login, full_name, role, email, phone, branch_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      return;
    }

    if (profile) {
      const normalizedUser = profile as User;
      setUser(normalizedUser);
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
    }
  };

  const login = async (loginInput: string, password: string) => {
    try {
      let email = loginInput;

      if (!loginInput.includes('@')) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('email')
          .eq('login', loginInput)
          .maybeSingle();

        if (error || !profile?.email) {
          throw new Error('Unknown login');
        }

        email = profile.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      await hydrateSession(data.session);
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  };

  const logout = async () => {
    try {
      if (pushToken) {
        await unregisterPushToken(pushToken);
      }
      
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('pushToken');

      await supabase.auth.signOut();
      
      setToken(null);
      setUser(null);
      setPushToken(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const refreshUser = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await hydrateSession(data.session);
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
