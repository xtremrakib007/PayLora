import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { post } from '../src/api';
import { ago } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { routeForLink } from '../src/modules';
import { C } from '../src/theme';
import { Btn, Empty, ListItem, Loading, Screen, T } from '../src/ui';

export default function Notifications() {
  const q = useGet<any[]>('/notifications');
  const read = useAction((ids?: string[]) => post('/notifications/read', { ids }), { invalidate: ['/notifications', '/home'] });
  useEffect(() => { /* opening the list doesn't mark read; tapping an item does */ }, []);
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.data?.some((n) => !n.readAt) && <Btn kind="ghost" small title="Mark all as read" onPress={() => read.run(undefined)} />}
      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
        {!q.data ? <Loading /> : !q.data.length ? <Empty title="You're all caught up" icon="bell-ring-outline" /> : q.data.map((n) => (
          <ListItem key={n.id} left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.readAt ? 'transparent' : C.brand }} />}
            title={<T bold={!n.readAt}>{n.title}</T>} sub={n.body} right={<T muted small>{ago(n.createdAt)}</T>}
            onPress={() => { if (!n.readAt) read.run([n.id]); const r = routeForLink(n.link); if (r && r !== '/notifications') router.push(r as any); }} />))}
      </View>
    </Screen>
  );
}
