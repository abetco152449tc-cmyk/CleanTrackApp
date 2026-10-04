import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '@/lib/store';
import PushListener from '@/components/push-listener';
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <PushListener />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
