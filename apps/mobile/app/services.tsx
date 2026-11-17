import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { patch, post } from '../src/api';
import { ago } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Chips, Empty, Field, Icon, ListItem, Loading, Row, s, Screen, Sheet, T } from '../src/ui';

export default function Services() {
  const q = useGet<any[]>('/services?mine=1');
  const cats = useGet<string[]>('/services/categories');
  const [nw, setNew] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const create = useAction(() => post('/services', nw), { ok: 'Request sent to HR', invalidate: ['/services'], onDone: () => setNew(null) });
  const send = useAction(() => post(`/services/${openId}/reply`, { text: reply }), { invalidate: ['/services'], onDone: () => setReply('') });
  const close = useAction(() => patch(`/services/${openId}/status`, { status: 'CLOSED' }), { invalidate: ['/services'], onDone: () => setOpenId(null) });
  const t = q.data?.find((x) => x.id === openId);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
          {!q.data ? <Loading /> : !q.data.length ? <Empty title="No requests" sub="Ask HR for letters, payroll queries, equipment and more." icon="face-agent" /> : q.data.map((r) => (
            <ListItem key={r.id} title={r.subject} sub={`${r.category} · ${ago(r.updatedAt)} · ${r.thread.length} repl${r.thread.length === 1 ? 'y' : 'ies'}`} right={<Badge s={r.status} />} onPress={() => setOpenId(r.id)} />))}
        </View>
      </Screen>
      <Pressable onPress={() => setNew({ category: cats.data?.[0] || 'Other', subject: '', body: '' })} style={{ position: 'absolute', right: 20, bottom: 24, flexDirection: 'row', gap: 6, paddingHorizontal: 18, height: 54, borderRadius: 27, backgroundColor: C.brand, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={22} color="#fff" /><T bold style={{ color: '#fff' }}>New request</T>
      </Pressable>
      <Sheet visible={!!nw} title="New request" onClose={() => setNew(null)}>
        {nw && <>
          <T muted small>Category</T><Chips value={nw.category} onChange={(v) => setNew({ ...nw, category: v })} options={(cats.data || []).map((c) => [c, c] as [string, string])} />
          <Field label="Subject" value={nw.subject} onChangeText={(v) => setNew({ ...nw, subject: v })} />
          <Field label="Details" value={nw.body} onChangeText={(v) => setNew({ ...nw, body: v })} multiline />
          <Btn title="Send to HR" disabled={nw.subject.length < 3 || nw.body.length < 3 || create.busy} onPress={() => create.run(undefined)} />
        </>}
      </Sheet>
      <Sheet visible={!!t} title={t?.subject || ''} onClose={() => setOpenId(null)}>
        {t && <>
          <Row><Badge s={t.status} /><T muted small>{t.category}</T></Row>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12 }}><T>{t.body}</T></View>
          {t.thread.map((m: any, i: number) => <View key={i} style={{ backgroundColor: m.staff ? C.brandLight : '#fff', borderRadius: 12, padding: 12, marginLeft: m.staff ? 0 : 30, marginRight: m.staff ? 30 : 0 }}><T small bold>{m.name}{m.staff ? ' · HR' : ''} <T muted small>{ago(m.at)}</T></T><T>{m.text}</T></View>)}
          {t.status !== 'CLOSED' && <>
            <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline placeholder="Write a reply…" placeholderTextColor={C.faint} value={reply} onChangeText={setReply} />
            <Row><Btn title="Send" style={{ flex: 1 }} disabled={!reply.trim() || send.busy} onPress={() => send.run(undefined)} /><Btn kind="ghost" title="Close request" onPress={() => close.run(undefined)} /></Row>
          </>}
        </>}
      </Sheet>
    </View>
  );
}
