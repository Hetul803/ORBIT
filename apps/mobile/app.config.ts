import type { ConfigContext } from 'expo/config';

const configured = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

export default ({ config }: ConfigContext) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const basePlugins = config.plugins ?? [];
  const sentryPlugin: [string, Record<string, string>][] =
    configured(sentryOrg) && configured(sentryProject)
      ? [['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }]]
      : [];

  return {
    ...config,
    runtimeVersion: { policy: 'appVersion' },
    updates: configured(projectId)
      ? { url: `https://u.expo.dev/${projectId}` }
      : { enabled: false },
    extra: {
      ...(config.extra ?? {}),
      ...(configured(projectId) ? { eas: { projectId } } : {}),
    },
    plugins: [...basePlugins, ...sentryPlugin],
  };
};
