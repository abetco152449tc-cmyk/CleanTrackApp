import type { ConfigContext, ExpoConfig } from 'expo/config';
export default function config({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: config.name ?? 'CleanTrack',
    slug: config.slug ?? 'CleanTrackApp',
    plugins: [...(config.plugins ?? []), 'expo-notifications'],
    extra: {
      ...config.extra,
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
        : {}),
    },
  };
}
