import { Pressable, View } from 'react-native';
import { patch } from '../src/api';
import { fmtShort } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Card, Empty, Icon, Loading, Row, Screen, T } from '../src/ui';

export default function Onboarding() {
  const q = useGet<any[]>('/onboarding/mine');
  const toggle = useAction(([id, done]: [string, boolean]) => patch(`/onboarding/tasks/${id}`, { done }), { invalidate: ['/onboarding'] });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {!q.data ? <Loading /> : !q.data.length ? <Empty title="No onboarding checklist" icon="door-open" /> : q.data.map((o) => {
        const done = o.tasks.filter((t: any) => t.done).length, pct = o.tasks.length ? Math.round((done / o.tasks.length) * 100) : 0;
        return (
          <Card key={o.id} style={{ gap: 10 }}>
            <Row><T bold style={{ flex: 1, fontSize: 17 }}>{o.title}</T><T bold style={{ color: C.brand }}>{pct}%</T></Row>
            <View style={{ height: 8, backgroundColor: '#eee', borderRadius: 4 }}><View style={{ height: 8, width: `${pct}%`, backgroundColor: C.brand, borderRadius: 4 }} /></View>
            {o.tasks.map((t: any) => {
              const mine = t.assignee === 'EMPLOYEE';
              return (
                <Pressable key={t.id} disabled={!mine} onPress={() => toggle.run([t.id, !t.done])}>
                  <Row style={{ paddingVertical: 8 }}>
                    <Icon name={t.done ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={24} color={t.done ? C.ok : mine ? C.brand : C.faint} />
                    <View style={{ flex: 1 }}><T style={t.done ? { textDecorationLine: 'line-through', color: C.faint } : undefined}>{t.title}</T>{t.dueDate && <T muted small>Due {fmtShort(t.dueDate)}</T>}</View>
                    <Badge s={mine ? 'IN_PROGRESS' : undefined} label={mine ? 'You' : t.assignee === 'HR' ? 'HR' : 'Manager'} />
                  </Row>
                </Pressable>);
            })}
          </Card>);
      })}
    </Screen>
  );
}
