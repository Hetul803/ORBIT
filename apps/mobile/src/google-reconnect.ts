import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, jsonBody } from './api';

/** Measure actual prompt exposure once per expiry episode, independently of app retention. */
export const useGoogleReconnectPrompt = (
  source: 'connections' | 'catch',
  visible: boolean,
  expiredAt: string | null | undefined,
  updatedAt: number,
): void => {
  const pathname = usePathname();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (
      !visible ||
      !foreground ||
      pathname !== `/${source}` ||
      !expiredAt ||
      recorded.current === expiredAt
    )
      return;
    let active = true;
    void api('/v1/connections/gmail/reconnect-prompt', jsonBody({ source, expiredAt }))
      .then(() => {
        if (active) recorded.current = expiredAt;
      })
      .catch(() => undefined); // A failed measurement never prevents reconnection; retry on status refresh.
    return () => {
      active = false;
    };
  }, [source, visible, foreground, pathname, expiredAt, updatedAt]);
};
