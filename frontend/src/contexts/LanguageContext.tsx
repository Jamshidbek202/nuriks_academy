import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  AppLanguage,
  LANGUAGE_LOCALES,
  setActiveFormattingLanguage,
  translateText,
} from '../i18n/translations';

const STORAGE_KEY = 'nurik_app_language';
const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'ru', 'uz'];

let activeLanguage: AppLanguage = 'en';
const nativeAlert = Alert.alert.bind(Alert);
let alertLocalizationInstalled = false;

function installAlertLocalization() {
  if (alertLocalizationInstalled) return;
  alertLocalizationInstalled = true;
  Alert.alert = ((title, message, buttons, options) => nativeAlert(
    translateText(title || '', activeLanguage),
    typeof message === 'string' ? translateText(message, activeLanguage) : message,
    buttons?.map((button) => ({
      ...button,
      text: button.text ? translateText(button.text, activeLanguage) : button.text,
    })),
    options,
  )) as typeof Alert.alert;
}

installAlertLocalization();

interface LanguageContextValue {
  language: AppLanguage;
  locale: string;
  isLanguageReady: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (source: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  useEffect(() => {
    const restoreLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
          activeLanguage = stored as AppLanguage;
          setActiveFormattingLanguage(stored as AppLanguage);
          setLanguageState(stored as AppLanguage);
        }
      } finally {
        setIsLanguageReady(true);
      }
    };
    restoreLanguage();
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(nextLanguage)) {
      throw new Error('Unsupported app language');
    }
    await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
    activeLanguage = nextLanguage;
    setActiveFormattingLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: LANGUAGE_LOCALES[language],
    isLanguageReady,
    setLanguage,
    t: (source: string) => translateText(source, language),
  }), [isLanguageReady, language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}
