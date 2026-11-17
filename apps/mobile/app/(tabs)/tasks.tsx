import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { patch, post } from '../../src/api';
import { useAuth } from '../../src/auth';
import { fmtShort, today } from '../../src/format';
import { useAction, useGet } from '../../src/hooks';
import { isManager } from '../../src/modules';
import { C } from '../../src/theme';
import { Badge, Btn, Chips, DateField, Empty, Field, Icon, ListItem, Loading, Row, Screen, Sheet, T } from '../../src/ui';

const NEXT: Record<string, string> = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: 'TODO' };

export default function Tasks() {
  const { me } = useAuth();
  const [filter, setFilter] = useState<'open' | 'DONE'>('open');
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const q = useGet<any[]>(`/tasks?scope=${scope}`);
  const emps = useGet<any[]>(isManager(me?.role) ? '/employees?status=ACTIVE' : null);
  const move = useAction(([id, status]: [string, string]) => patch(`/tasks/${id}`, { status }), { invalidate: ['/tasks', '/home'] });
  const [nw, setNew] = useState<any>(null);
  const create = useAction(() => post('/tasks', { ...nw, assigneeId: nw.assigneeId || null, dueDate: nw.dueDate || null }), { invalidate: ['/tasks', '/home'], onDone: () => setNew(null) });
  const list = (q.data || []).filter((t) => (filter === 'open' ? t.status !== 'DONE' : t.status === 'DONE'));
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {isManager(me?.role) && <Chips value={scope} onChange={setScope} options={[['mine', 'My tasks'], ['team', 'Team']]} />}
        <Chips value={filter} onChange={setFilter} options={[['open', 'Open'], ['DONE', 'Done']]} />
        <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
          {!q.data ? <Loading /> : !list.length ? <Empty title={filter === 'open' ? 'All clear!' : 'Nothing completed yet'} icon="checkbox-marked-outline" /> : list.map((t) => (
            <ListItem key={t.id}
              left={<Pressable hitSlop={10} onPress={() => move.run([t.id, NEXT[t.status]])}><Icon name={t.status === 'DONE' ? 'checkbox-marked-circle' : t.status === 'IN_PROGRESS' ? 'progress-clock' : 'checkbox-blank-circle-outline'} size={26} color={t.status === 'DONE' ? C.ok : t.status === 'IN_PROGRESS' ? C.info : C.faint} /></Pressable>}
              title={<T bold style={t.status === 'DONE' ? { textDecorationLine: 'line-through', color: C.faint } : undefined}>{t.title}</T>}
              sub={`${scope === 'team' ? (t.assigneeName || 'Unassigned') + ' · ' : ''}${t.dueDate ? 'Due ' + fmtShort(t.dueDate) : 'No due date'}${t.dueDate && t.dueDate < today() && t.status !== 'DONE' ? ' · overdue' : ''}${t.description ? '\n' + t.description : ''}`}
              right={<Badge s={t.priority} />} />))}
        </View>
        <T muted small style={{ textAlign: 'center' }}>Tap the circle to move a task: To do → In progress → Done</T>
      </Screen>
      <Pressable onPress={() => setNew({ title: '', description: '', assigneeId: '', dueDate: today(), priority: 'MEDIUM' })} style={{ position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
        <Icon name="plus" size={30} color="#fff" />
      </Pressable>
      <Sheet visible={!!nw} title="New task" onClose={() => setNew(null)}>
        {nw && <>
          <Field label="Title" value={nw.title} onChangeText={(v) => setNew({ ...nw, title: v })} />
          <Field label="Details" value={nw.description} onChangeText={(v) => setNew({ ...nw, description: v })} multiline />
          <DateField label="Due date" value={nw.dueDate} onChange={(v) => setNew({ ...nw, dueDate: v })} />
          <T muted small>Priority</T><Chips value={nw.priority} onChange={(v) => setNew({ ...nw, priority: v })} options={[['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High']]} />
          {emps.data && <><T muted small>Assign to</T><Chips value={nw.assigneeId} onChange={(v) => setNew({ ...nw, assigneeId: v })} options={[['', 'Myself'], ...emps.data.filter((e) => e.id !== me?.employee?.id).map((e) => [e.id, e.name] as [string, string])]} /></>}
          <Row><Btn title="Create task" style={{ flex: 1 }} disabled={!nw.title || create.busy} onPress={() => create.run(undefined)} /></Row>
        </>}
      </Sheet>
    </View>
  );
}
