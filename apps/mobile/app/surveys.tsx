import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { post } from '../src/api';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Empty, Field, Icon, ListItem, Loading, Row, Screen, Sheet, Stars, T } from '../src/ui';

export default function Surveys() {
  const q = useGet<any[]>('/surveys');
  const [open, setOpen] = useState<any>(null);
  const [a, setA] = useState<Record<string, any>>({});
  const send = useAction(() => post(`/surveys/${open.id}/responses`, { answers: a }), { ok: 'Thanks for your feedback!', invalidate: ['/surveys'], onDone: () => setOpen(null) });
  const list = (q.data || []).filter((s) => s.status === 'OPEN');
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
        {!q.data ? <Loading /> : !list.length ? <Empty title="No open surveys" icon="poll" /> : list.map((s) => (
          <ListItem key={s.id} title={s.title} sub={`${s.questions.length} questions${s.anonymous ? ' · anonymous' : ''}`} right={s.answered ? <Badge s="DONE" label="Answered" /> : <Badge s="PENDING" label="Take" />} onPress={s.answered ? undefined : () => { setA({}); setOpen(s); }} />))}
      </View>
      <Sheet visible={!!open} title={open?.title || ''} onClose={() => setOpen(null)}>
        {open && <>
          {open.anonymous && <View style={{ backgroundColor: C.infoL, padding: 10, borderRadius: 10 }}><T small style={{ color: C.info }}>Your answers are anonymous.</T></View>}
          {open.questions.map((q: any) => (
            <View key={q.id} style={{ gap: 8 }}>
              <T bold>{q.label}</T>
              {q.type === 'rating' && <Stars value={a[q.id]} onChange={(n) => setA({ ...a, [q.id]: n })} />}
              {q.type === 'choice' && q.options.map((o: string) => <Pressable key={o} onPress={() => setA({ ...a, [q.id]: o })}><Row><Icon name={a[q.id] === o ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={C.brand} /><T>{o}</T></Row></Pressable>)}
              {q.type === 'text' && <Field label="" value={a[q.id] || ''} onChangeText={(v) => setA({ ...a, [q.id]: v })} multiline />}
            </View>))}
          <Btn title="Submit" disabled={send.busy} onPress={() => send.run(undefined)} />
        </>}
      </Sheet>
    </Screen>
  );
}
