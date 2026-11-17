import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { del, post } from '../src/api';
import { fmtShort, money, today } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Chips, DateField, Empty, Field, Icon, ListItem, Loading, Screen, Section, Sheet, T } from '../src/ui';

export default function Claims() {
  const q = useGet<any[]>('/claims?mine=1');
  const cats = useGet<string[]>('/claims/categories');
  const [nw, setNew] = useState<any>(null);
  const create = useAction(() => post('/claims', { ...nw, amount: Number(nw.amount) }), { ok: 'Claim submitted', invalidate: ['/claims'], onDone: () => setNew(null) });
  const remove = useAction((id: string) => del(`/claims/${id}`), { invalidate: ['/claims'] });
  const pending = (q.data || []).filter((c) => c.status === 'PENDING').reduce((s, c) => s + Number(c.amount), 0);
  const approved = (q.data || []).filter((c) => c.status === 'APPROVED').reduce((s, c) => s + Number(c.amount), 0);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14 }}><T muted small>Pending</T><T bold style={{ fontSize: 20, color: C.warn }}>{money(pending)}</T></View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14 }}><T muted small>To be paid</T><T bold style={{ fontSize: 20, color: C.ok }}>{money(approved)}</T></View>
        </View>
        <Section title="My claims">
          {!q.data ? <Loading /> : !q.data.length ? <Empty title="No claims yet" sub="Approved claims are paid with your next salary." icon="receipt-text-outline" /> : q.data.map((c) => (
            <ListItem key={c.id} title={`${c.category} · ${money(c.amount)}`} sub={`${fmtShort(c.date)}${c.description ? ' · ' + c.description : ''}`}
              right={<View style={{ alignItems: 'flex-end', gap: 6 }}><Badge s={c.status} />{c.status === 'PENDING' && <Pressable onPress={() => remove.run(c.id)}><T small style={{ color: C.bad, fontWeight: '700' }}>Withdraw</T></Pressable>}</View>} />))}
        </Section>
      </Screen>
      <Pressable onPress={() => setNew({ category: cats.data?.[0] || 'Other', date: today(), amount: '', description: '', receiptUrl: '' })} style={{ position: 'absolute', right: 20, bottom: 24, flexDirection: 'row', gap: 6, paddingHorizontal: 18, height: 54, borderRadius: 27, backgroundColor: C.brand, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={22} color="#fff" /><T bold style={{ color: '#fff' }}>New claim</T>
      </Pressable>
      <Sheet visible={!!nw} title="New claim" onClose={() => setNew(null)}>
        {nw && <>
          <T muted small>Category</T><Chips value={nw.category} onChange={(v) => setNew({ ...nw, category: v })} options={(cats.data || []).map((c) => [c, c] as [string, string])} />
          <DateField label="Date of expense" value={nw.date} onChange={(v) => setNew({ ...nw, date: v })} />
          <Field label="Amount" value={nw.amount} onChangeText={(v) => setNew({ ...nw, amount: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
          <Field label="Description" value={nw.description} onChangeText={(v) => setNew({ ...nw, description: v })} multiline />
          <Field label="Receipt link (optional)" value={nw.receiptUrl} onChangeText={(v) => setNew({ ...nw, receiptUrl: v })} autoCapitalize="none" keyboardType="url" placeholder="https://drive.google.com/…" />
          <Btn title={create.busy ? 'Submitting…' : 'Submit claim'} disabled={!Number(nw.amount) || create.busy} onPress={() => create.run(undefined)} />
        </>}
      </Sheet>
    </View>
  );
}
