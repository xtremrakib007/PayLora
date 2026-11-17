import type { ExpoConfig } from 'expo/config';

/**
 * Set these before building:
 *   EXPO_PUBLIC_API_URL  — your API origin, e.g. https://api.yourdomain.com
 *   EAS_PROJECT_ID       — from `eas init` (needed for push notifications)
 */
const config: ExpoConfig = {
  name: 'Workwise HR',
  slug: 'workwise-hr',
  scheme: 'workwise',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',

  android: {
    package: process.env.ANDROID_PACKAGE || 'com.workwise.hr',
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0d6b5c' },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
  },
  ios: { bundleIdentifier: 'com.workwise.hr', supportsTablet: false },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash.png', imageWidth: 160, backgroundColor: '#10251f' }],
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Workwise uses your location to verify clock-in at your workplace.' }],
    ['expo-notifications', { color: '#0d6b5c' }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
