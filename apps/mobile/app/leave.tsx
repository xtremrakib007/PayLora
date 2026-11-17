import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { post } from '../src/api';
import { fmtShort, today } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Chips, DateField, Empty, Field, Icon, ListItem, Loading, Row, Screen, Section, Sheet, T } from '../src/ui';

export default function Leave() {
  const bal = useGet<any>('/leave/my-balances');
  const reqs = useGet<any[]>('/leave/requests?mine=1');
  const types = useGet<any[]>('/company/leave-types');
  const [nw, setNew] = useState<any>(null);
  const apply = useAction(() => post('/leave/requests', nw), { ok: 'Leave request sent', invalidate: ['/leave', '/home'], onDone: () => setNew(null) });
  const cancel = useAction((id: string) => post(`/leave/requests/${id}/cancel`), { invalidate: ['/leave', '/home'] });
  const row = bal.data?.rows?.[0];
  const active = (types.data || []).filter((t) => t.active);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={reqs.isRefetching} onRefresh={() => { bal.refetch(); reqs.refetch(); }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {!bal.data ? <Loading /> : bal.data.types.filter((t: any) => t.daysPerYear > 0).map((t: any) => {
            const b = row?.balances.find((x: any) => x.leaveTypeId === t.id);
            return <View key={t.id} style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14 }}>
              <T muted small>{t.name}</T><T bold style={{ fontSize: 26 }}>{b?.remaining ?? '—'}<T muted small> / {t.daysPerYear}</T></T>
              <View style={{ height: 6, backgroundColor: '#eee', borderRadius: 3, marginTop: 6 }}><View style={{ height: 6, borderRadius: 3, backgroundColor: C.brand, width: `${Math.max(0, Math.min(100, ((b?.remaining ?? 0) / t.daysPerYear) * 100))}%` }} /></View>
              {!!b?.pending && <T muted small>{b.pending} pending</T>}
            </View>;
          })}
        </View>
        <Section title="My requests">
          {!reqs.data ? <Loading /> : !reqs.data.length ? <Empty title="No leave requests yet" icon="calendar-month" /> : reqs.data.map((l) => (
            <ListItem key={l.id} title={l.leaveType} sub={`${fmtShort(l.fromDate)}${l.toDate !== l.fromDate ? ' → ' + fmtShort(l.toDate) : ''} · ${l.days} day${l.days === 1 ? '' : 's'}${l.reason ? '\n' + l.reason : ''}`}
              right={<View style={{ alignItems: 'flex-end', gap: 6 }}><Badge s={l.status} />{(l.status === 'PENDING' || (l.status === 'APPROVED' && l.fromDate > today())) && <Pressable onPress={() => cancel.run(l.id)}><T small style={{ color: C.bad, fontWeight: '700' }}>Cancel</T></Pressable>}</View>} />))}
        </Section>
      </Screen>
      <Pressable onPress={() => setNew({ leaveTypeId: active[0]?.id, fromDate: today(), toDate: today(), reason: '', halfDay: false })} style={{ position: 'absolute', right: 20, bottom: 24, flexDirection: 'row', gap: 6, paddingHorizontal: 18, height: 54, borderRadius: 27, backgroundColor: C.brand, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={22} color="#fff" /><T bold style={{ color: '#fff' }}>Apply</T>
      </Pressable>
      <Sheet visible={!!nw} title="Apply for leave" onClose={() => setNew(null)}>
        {nw && <>
          <T muted small>Leave type</T>
          <Chips value={nw.leaveTypeId} onChange={(v) => setNew({ ...nw, leaveTypeId: v })} options={active.map((t) => [t.id, t.name] as [string, string])} />
          <DateField label="From" value={nw.fromDate} onChange={(v) => setNew({ ...nw, fromDate: v, toDate: v > nw.toDate ? v : nw.toDate })} />
          <DateField label="To" value={nw.toDate} min={nw.fromDate} onChange={(v) => setNew({ ...nw, toDate: v })} />
          {nw.fromDate === nw.toDate && <Pressable onPress={() => setNew({ ...nw, halfDay: !nw.halfDay })}><Row><Icon name={nw.halfDay ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={C.brand} /><T>Half day</T></Row></Pressable>}
          <Field label="Reason" value={nw.reason} onChangeText={(v) => setNew({ ...nw, reason: v })} multiline />
          <T muted small>Rest days and public holidays are not counted. Your manager is notified.</T>
          <Btn title={apply.busy ? 'Sending…' : 'Submit request'} disabled={apply.busy} onPress={() => apply.run(undefined)} />
        </>}
      </Sheet>
    </View>
  );
}
