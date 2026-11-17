import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { useGet } from '../../src/hooks';
import { APPS } from '../../src/modules';
import { C } from '../../src/theme';
import { Avatar, Badge, Icon, ListItem, Row, Screen, Section, T } from '../../src/ui';

export default function More() {
  const { me, has, signOut, switchCompany } = useAuth();
  const unread = useGet<{ count: number }>('/notifications/unread-count');
  const apps = APPS.filter((a) => has(a.module) && (!a.roles || (me?.role && a.roles.includes(me.role))));
  const go = (r: string) => router.push(r as any);
  return (
    <Screen>
      <Row style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16 }}>
        <Avatar name={me?.user.name || '?'} size={54} />
        <View style={{ flex: 1 }}><T bold style={{ fontSize: 18 }}>{me?.user.name}</T><T muted small>{me?.employee?.designation || me?.user.email}</T><T muted small>{me?.company?.name} · {me?.role?.toLowerCase()}</T></View>
      </Row>
      <Section title="Account">
        <ListItem left={<Icon name="bell-ring-outline" size={22} color={C.brand} />} title="Notifications" right={unread.data?.count ? <Badge s="REJECTED" label={String(unread.data.count)} /> : <Icon name="chevron-right" size={22} color={C.faint} />} onPress={() => go('/notifications')} />
        {me?.employee && <ListItem left={<Icon name="account-circle" size={22} color={C.brand} />} title="My profile" right={<Icon name="chevron-right" size={22} color={C.faint} />} onPress={() => go('/profile')} />}
        {me && me.memberships.length > 1 && <ListItem left={<Icon name="domain" size={22} color={C.brand} />} title="Switch company" sub={me.company?.name} onPress={() => Alert.alert('Switch company', undefined, [...me.memberships.map((m) => ({ text: m.name, onPress: () => { void switchCompany(m.companyId); } })), { text: 'Cancel', style: 'cancel' as const }])} />}
        <ListItem left={<Icon name="logout" size={22} color={C.bad} />} title="Sign out" onPress={() => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } }])} />
      </Section>
      <Section title="All apps">
        {apps.map((a) => <ListItem key={a.key} left={<View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={20} color={a.fg} /></View>} title={a.title} right={<Icon name="chevron-right" size={22} color={C.faint} />} onPress={() => go(a.route)} />)}
      </Section>
      <T muted small style={{ textAlign: 'center' }}>Admin tools (payroll runs, settings, billing) are in the web app.</T>
    </Screen>
  );
}
