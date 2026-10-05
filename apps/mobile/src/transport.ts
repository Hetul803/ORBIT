/** A late-bound authenticated transport avoids a layout/api import cycle. */
export let apiTransport: (path: string, init: RequestInit) => Promise<Response> = () =>
  Promise.reject(new Error('ORBIT transport has not initialized'));

export const setApiTransport = (
  transport: (path: string, init: RequestInit) => Promise<Response>,
): void => {
  apiTransport = transport;
};
