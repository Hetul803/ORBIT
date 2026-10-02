export interface ApiUrlEnvironment {
  readonly configured?: string;
  readonly platform: string;
  readonly physicalDevice: boolean;
  readonly developmentHost?: string;
  readonly webHost?: string;
  readonly production: boolean;
}

export const resolveApiUrl = (environment: ApiUrlEnvironment): string => {
  const configured = environment.configured?.trim().replace(/\/$/u, '');
  if (configured !== undefined && configured.length > 0) return configured;
  if (environment.production) return '';
  if (environment.platform === 'web') {
    const host = environment.webHost?.trim();
    return `http://${host === undefined || host.length === 0 ? 'localhost' : host}:4100`;
  }
  if (environment.physicalDevice) {
    const host = environment.developmentHost?.split(':')[0]?.trim();
    return host === undefined || host.length === 0 ? '' : `http://${host}:4100`;
  }
  return environment.platform === 'android' ? 'http://10.0.2.2:4100' : 'http://localhost:4100';
};
