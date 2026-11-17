import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { del, post } from '../src/api';
import { addDays, fmtShort, today } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Chips, DateField, Empty, Field, Icon, ListItem, Loading, Screen, Section, Sheet, T } from '../src/ui';

export default function Timesheets() {
  const from = addDays(today(), -30);
  const q = useGet<any[]>(`/timesheets?mine=1&from=${from}&to=${today()}`);
  const [nw, setNew] = useState<any>(null);
  const create = useAction(() => post('/timesheets', { ...nw, hours: Number(nw.hours) }), { invalidate: ['/timesheets'], onDone: () => setNew(null) });
  const remove = useAction((id: string) => del(`/timesheets/${id}`), { invalidate: ['/timesheets'] });
  const projects = [...new Set((q.data || []).map((r) => r.project))];
  const week = (q.data || []).filter((r) => r.date >= addDays(today(), -6)).reduce((s, r) => s + Number(r.hours), 0);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14 }}><T muted small>Last 7 days</T><T bold style={{ fontSize: 26 }}>{week.toFixed(1)} h</T></View>
        <Section title="Last 30 days">
          {!q.data ? <Loading /> : !q.data.length ? <Empty title="No time logged" icon="clock-outline" /> : q.data.map((r) => (
            <ListItem key={r.id} title={`${r.project} · ${Number(r.hours).toFixed(2)} h`} sub={`${fmtShort(r.date)}${r.task ? ' · ' + r.task : ''}`}
              right={<View style={{ alignItems: 'flex-end', gap: 6 }}><Badge s={r.status} />{r.status === 'PENDING' && <Pressable onPress={() => remove.run(r.id)}><T small style={{ color: C.bad, fontWeight: '700' }}>Delete</T></Pressable>}</View>} />))}
        </Section>
      </Screen>
      <Pressable onPress={() => setNew({ date: today(), project: projects[0] || '', task: '', hours: '', notes: '' })} style={{ position: 'absolute', right: 20, bottom: 24, flexDirection: 'row', gap: 6, paddingHorizontal: 18, height: 54, borderRadius: 27, backgroundColor: C.brand, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={22} color="#fff" /><T bold style={{ color: '#fff' }}>Log time</T>
      </Pressable>
      <Sheet visible={!!nw} title="Log time" onClose={() => setNew(null)}>
        {nw && <>
          <DateField label="Date" value={nw.date} onChange={(v) => setNew({ ...nw, date: v })} />
          {projects.length > 0 && <Chips value={nw.project} onChange={(v) => setNew({ ...nw, project: v })} options={projects.map((p) => [p, p] as [string, string])} />}
          <Field label="Project" value={nw.project} onChangeText={(v) => setNew({ ...nw, project: v })} />
          <Field label="Task" value={nw.task} onChangeText={(v) => setNew({ ...nw, task: v })} />
          <Field label="Hours" value={nw.hours} onChangeText={(v) => setNew({ ...nw, hours: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
          <Btn title="Save" disabled={!nw.project || !Number(nw.hours) || create.busy} onPress={() => create.run(undefined)} />
        </>}
      </Sheet>
    </View>
  );
}
