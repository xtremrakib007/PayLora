import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { ClockCard } from '../../src/ClockCard';
import { fmtDay, fmtShort, fmtTime, monthLabel, money } from '../../src/format';
import { useGet } from '../../src/hooks';
import { APPS } from '../../src/modules';
import { C } from '../../src/theme';
import { Badge, Icon, ListItem, Loading, Row, Screen, Section, T } from '../../src/ui';

export default function Home() {
  const { me, has } = useAuth();
  const q = useGet<any>('/home');
  const h = q.data;
  const apps = APPS.filter((a) => has(a.module) && (!a.roles || (me?.role && a.roles.includes(me.role))));
  const hour = new Date().getHours();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Row>
          <View style={{ flex: 1 }}>
            <T muted small>{me?.company?.name}</T>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink }}>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me?.user.name.split(' ')[0]}</Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bell-ring-outline" size={22} color={C.ink} />
            {!!h?.unreadNotifications && <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: C.bad, borderRadius: 10, paddingHorizontal: 5, minWidth: 18, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{h.unreadNotifications}</Text></View>}
          </Pressable>
        </Row>

        {!h ? <Loading /> : <>
          {h.attendanceToday !== undefined && h.employee && <ClockCard today={h.attendanceToday} shift={h.shiftToday} />}
          {!me?.employee && <View style={{ backgroundColor: C.infoL, padding: 12, borderRadius: 12 }}><T style={{ color: C.info }}>Your account isn't linked to an employee profile yet — ask HR to link it to use clock-in, payslips and leave.</T></View>}

          <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 6, flexDirection: 'row', flexWrap: 'wrap' }}>
            {apps.map((a) => (
              <Pressable key={a.key} onPress={() => router.push(a.route as any)} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 56, height: 56, borderRadius: 17, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={28} color={a.fg} /></View>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.ink, textAlign: 'center' }} numberOfLines={1}>{a.title}</Text>
              </Pressable>
            ))}
          </View>

          {h.team && (
            <Pressable onPress={() => router.push('/approvals')}>
              <Section title="Team today">
                <Row style={{ justifyContent: 'space-between' }}>
                  {[['Present', (h.team.attendanceToday.PRESENT || 0) + (h.team.attendanceToday.HALF_DAY || 0), C.ok], ['On leave', h.team.onLeaveToday.length, C.info], ['To approve', h.team.pending.leave + h.team.pending.claims + h.team.pending.timesheets, C.warn]].map(([l, n, c]) => (
                    <View key={l as string} style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: 24, fontWeight: '800', color: c as string }}>{n as number}</Text><T muted small>{l as string}</T></View>))}
                </Row>
              </Section>
            </Pressable>
          )}
          {h.myTasks && h.myTasks.length > 0 && <Section title="My tasks" action={<T small style={{ color: C.brand, fontWeight: '700' }} >{h.myTasks.length} open</T>}>
            {h.myTasks.map((t: any) => <ListItem key={t.id} title={t.title} sub={t.dueDate ? `Due ${fmtShort(t.dueDate)}` : undefined} right={<Badge s={t.priority} />} onPress={() => router.push('/(tabs)/tasks')} />)}
          </Section>}
          {h.upcomingMeetings && h.upcomingMeetings.length > 0 && <Section title="Upcoming meetings">
            {h.upcomingMeetings.map((m: any) => <ListItem key={m.id} title={m.title} sub={`${fmtDay(m.startAt)} · ${fmtTime(m.startAt)}${m.location ? ' · ' + m.location : ''}`} onPress={() => router.push('/(tabs)/meetings')} left={<Icon name="calendar-clock" size={22} color={C.info} />} />)}
          </Section>}
          {h.latestPayslip && <Pressable onPress={() => router.push('/payslips')}><Section title="Latest payslip"><T muted>{monthLabel(h.latestPayslip.period)}</T><Text style={{ fontSize: 28, fontWeight: '800', color: C.brandDark }}>{money(h.latestPayslip.net)}</Text><T muted small>Net pay · tap to view</T></Section></Pressable>}
          {h.announcements && h.announcements.length > 0 && <Section title="Announcements">
            {h.announcements.map((p: any) => <ListItem key={p.id} left={<Icon name="bullhorn" size={20} color={C.warn} />} title={<T numberOfLines={3}>{p.content}</T>} sub={`${p.authorName} · ${fmtShort(p.createdAt)}`} onPress={() => router.push('/feed')} />)}
          </Section>}
        </>}
      </Screen>
    </SafeAreaView>
  );
}
