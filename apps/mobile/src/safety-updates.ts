import { queryClient } from './query';
import { clearSocialOfflineCache } from './offline';

const socialKeys = new Set([
  'introductions',
  'introduction',
  'transcript',
  'exchange',
  'exchange-proposals',
  'inbox',
  'brief',
  'today',
]);

export const refreshSafetySurfaces = async (): Promise<void> => {
  await clearSocialOfflineCache();
  await queryClient.cancelQueries({
    predicate: (query) => socialKeys.has(String(query.queryKey[0])),
  });
  await queryClient.resetQueries({
    predicate: (query) => socialKeys.has(String(query.queryKey[0])),
  });
};

export const subscribeSafetyUpdates = (accessToken: string, apiUrl: string): (() => void) => {
  const configured = process.env.EXPO_PUBLIC_WS_URL;
  const base = configured?.trim().length
    ? configured.trim()
    : `${apiUrl.replace(/^http/u, 'ws')}/v1/stream`;
  let socket: WebSocket | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = (): void => {
    if (stopped || !base.startsWith('ws')) return;
    socket = new WebSocket(
      `${base}${base.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`,
    );
    socket.onmessage = (event): void => {
      try {
        const type = (JSON.parse(String(event.data)) as { type?: string }).type;
        if (type === 'safety.suppressed') void refreshSafetySurfaces().catch(() => undefined);
        if (type === 'google.sync_progress') {
          // The global observer coalesces content refreshes; a batch is not a pull-to-refresh.
          void queryClient.invalidateQueries({ queryKey: ['gmail-status'] });
        }
        if (type === 'microsoft.sync_progress')
          void queryClient.invalidateQueries({ queryKey: ['outlook-status'] });
      } catch {
        /* Never log stream payloads. */
      }
    };
    socket.onclose = (event): void => {
      if (!stopped && event.code !== 1008) timer = setTimeout(connect, 5_000);
    };
    socket.onerror = (): void => {
      /* Reconnect through onclose without exposing the token-bearing URL. */
    };
  };
  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
};
