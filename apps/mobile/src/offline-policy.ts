/** Only presentation reads that remain useful without a live transport are cached. */
export const isOfflineReadable = (path: string, method: string): boolean =>
  method === 'GET' &&
  (/^\/v1\/(brief|life|introductions|skills|watchers|activity|me)(?:[/?]|$)/u.test(path) ||
    path === '/v1/proactive');

/** The queue is limited to reversible local state choices, never message sending. */
export const isOfflineQueueable = (path: string, method: string): boolean =>
  method !== 'GET' &&
  (/^\/v1\/life\/(?:catch\/)?[^/]+\/(?:dismiss|snooze|complete)$/u.test(path) ||
    /^\/v1\/proactive\/[^/]+\/respond$/u.test(path) ||
    /^\/v1\/proactive\/policies\/[^/]+(?:\/approve-act)?$/u.test(path));
