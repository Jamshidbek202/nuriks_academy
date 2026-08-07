import { create } from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export const SESSION_ENDED_MESSAGE = 'Your access has ended or your session expired. Sign in again, or contact the administrator if your account was deactivated.';

type SessionInvalidHandler = (message: string) => void;
let sessionInvalidHandler: SessionInvalidHandler | null = null;
let sessionInvalidNoticeSent = false;

export const setSessionInvalidHandler = (handler: SessionInvalidHandler | null) => {
  sessionInvalidHandler = handler;
};

export const resetSessionInvalidNotice = () => {
  sessionInvalidNoticeSent = false;
};

export const api = create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const apiErrorMessage = (error: any, fallback = 'Request failed'): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail.message === 'string') return detail.message;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg).filter(Boolean).join(', ') || fallback;
  }
  return error?.message || fallback;
};

// Request interceptor for debugging
api.interceptors.request.use(
  async (config) => {
    if (!config.headers.Authorization) {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;
    const requestUrl = String(error?.config?.url || '');
    const authorization = error?.config?.headers?.Authorization || error?.config?.headers?.authorization;
    const publicAuthRequest = [
      '/auth/login',
      '/auth/invitations/',
      '/auth/password-reset/',
      '/telegram/webhook',
    ].some((path) => requestUrl.includes(path));
    const inactiveAccount = status === 403 && (
      detail === 'Account is inactive' || detail?.code === 'ACCOUNT_INACTIVE'
    );
    const invalidAuthenticatedSession = Boolean(authorization) && !publicAuthRequest && (
      status === 401 || inactiveAccount
    );

    if (invalidAuthenticatedSession) {
      error.sessionInvalidated = true;
      if (error.response?.data) {
        error.response.data.detail = {
          code: 'SESSION_ENDED',
          message: SESSION_ENDED_MESSAGE,
        };
      }
      if (!sessionInvalidNoticeSent) {
        sessionInvalidNoticeSent = true;
        sessionInvalidHandler?.(SESSION_ENDED_MESSAGE);
      }
    }
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request && !error?.config?.suppressNetworkErrorLog) {
      console.error('Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
