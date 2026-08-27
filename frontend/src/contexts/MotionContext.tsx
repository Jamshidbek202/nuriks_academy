import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const MOTION = {
  instant: 110,
  feedback: 140,
  state: 190,
  navigation: 210,
  overlay: 260,
  hero: 520,
  easing: {
    enter: [0.23, 1, 0.32, 1] as const,
    standard: [0.77, 0, 0.175, 1] as const,
  },
} as const;

type MotionContextValue = {
  reduceMotion: boolean;
  ready: boolean;
};

const MotionContext = createContext<MotionContextValue>({ reduceMotion: true, ready: false });

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
        setReady(true);
      }
    }).catch(() => {
      if (mounted) setReady(true);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
      setReady(true);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo(() => ({ reduceMotion, ready }), [ready, reduceMotion]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionPreference() {
  return useContext(MotionContext);
}
