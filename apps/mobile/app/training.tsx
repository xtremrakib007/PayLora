import { Linking, View } from 'react-native';
import { patch } from '../src/api';
import { fmtShort } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { Badge, Btn, Card, Chips, Empty, Loading, Row, Screen, T } from '../src/ui';

export default function Training() {
  const q = useGet<any[]>('/training/enrollments/mine');
  const set = useAction(([id, status]: [string, string]) => patch(`/training/enrollments/${id}`, { status }), { invalidate: ['/training'] });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {!q.data ? <Loading /> : !q.data.length ? <Empty title="No courses assigned" icon="school-outline" /> : q.data.map((e) => (
        <Card key={e.id} style={{ gap: 8 }}>
          <Row><View style={{ flex: 1 }}><T bold>{e.course.title}</T><T muted small>{[e.course.provider, `${e.course.durationHours} h`, e.dueDate && `due ${fmtShort(e.dueDate)}`].filter(Boolean).join(' · ')}</T></View><Badge s={e.status} /></Row>
          {!!e.course.description && <T muted small>{e.course.description}</T>}
          <Chips value={e.status} onChange={(v) => set.run([e.id, v])} options={[['ASSIGNED', 'Not started'], ['IN_PROGRESS', 'In progress'], ['COMPLETED', 'Completed']]} />
          {e.course.url && <Btn kind="ghost" small icon="link" title="Open course" onPress={() => Linking.openURL(e.course.url)} />}
        </Card>))}
    </Screen>
  );
}
