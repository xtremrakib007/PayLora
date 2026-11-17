import { Tabs } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useGet } from '../../src/hooks';
import { C } from '../../src/theme';
import { Icon } from '../../src/ui';

export default function TabsLayout() {
  const { has, me } = useAuth();
  const unread = useGet<{ count: number }>(me?.company ? '/notifications/unread-count' : null, { refetchInterval: 60_000 });
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.faint, headerStyle: { backgroundColor: C.bg }, headerShadowVisible: false,
      headerTitleStyle: { fontWeight: '800', fontSize: 20 }, tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color }) => <Icon name="home-variant" size={24} color={color as string} /> }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', href: has('attendance') ? undefined : null, tabBarIcon: ({ color }) => <Icon name="fingerprint" size={24} color={color as string} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', href: has('tasks') ? undefined : null, tabBarIcon: ({ color }) => <Icon name="checkbox-marked-outline" size={24} color={color as string} /> }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', href: has('meetings') ? undefined : null, tabBarIcon: ({ color }) => <Icon name="calendar-account" size={24} color={color as string} /> }} />
      <Tabs.Screen name="more" options={{ title: 'Me', tabBarBadge: unread.data?.count ? unread.data.count : undefined, tabBarIcon: ({ color }) => <Icon name="account-circle" size={24} color={color as string} /> }} />
    </Tabs>
  );
}
