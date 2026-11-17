import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../src/api';
import { AuthProvider, useAuth } from '../src/auth';
import { routeForLink } from '../src/modules';
import { C } from '../src/theme';
import { Loading } from '../src/ui';

const qc = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2, staleTime: 15_000 } } });

function Gate() {
  const { ready, signedIn, me } = useAuth();
  const seg = useSegments();
  useEffect(() => {
    if (!ready) return;
    const inAuth = seg[0] === 'login';
    if (!signedIn && !inAuth) router.replace('/login');
    else if (signedIn && me && inAuth) router.replace('/');
  }, [ready, signedIn, me, seg]);

  // Open the right screen when a push notification is tapped
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const to = routeForLink((r.notification.request.content.data as any)?.link);
      if (to) router.push(to as any);
    });
    return () => sub.remove();
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><Loading /></View>;
  return (
    <Stack screenOptions={{ headerTintColor: C.ink, headerStyle: { backgroundColor: C.bg }, headerShadowVisible: false, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="payslips" options={{ title: 'Payslips' }} />
      <Stack.Screen name="leave" options={{ title: 'Leave' }} />
      <Stack.Screen name="claims" options={{ title: 'Claims' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="feed" options={{ title: 'Feed' }} />
      <Stack.Screen name="surveys" options={{ title: 'Surveys' }} />
      <Stack.Screen name="services" options={{ title: 'HR services' }} />
      <Stack.Screen name="timesheets" options={{ title: 'Timesheets' }} />
      <Stack.Screen name="shifts" options={{ title: 'My shifts' }} />
      <Stack.Screen name="training" options={{ title: 'Training' }} />
      <Stack.Screen name="performance" options={{ title: 'Performance' }} />
      <Stack.Screen name="onboarding" options={{ title: 'Onboarding' }} />
      <Stack.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Stack.Screen name="directory" options={{ title: 'Directory' }} />
      <Stack.Screen name="profile" options={{ title: 'My profile' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider><StatusBar style="dark" /><Gate /></AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
