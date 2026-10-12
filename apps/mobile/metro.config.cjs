const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Keep Expo's monorepo defaults and add native bundle/source-map debug IDs.
// Error monitoring only: no web replay or development source-context endpoint.
module.exports = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
  enableSourceContextInDevelopment: false,
});
