import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { patch, post } from '../../src/api';
import { useAuth } from '../../src/auth';
import { addDays, fmtTime, today } from '../../src/format';
import { useAction, useGet } from '../../src/hooks';
import { C } from '../../src/theme';
import { Badge, Btn, Chips, DateField, Empty, Field, Icon, Loading, Row, Screen, Section, Sheet, T } from '../../src/ui';

const TIMES = Array.from({ length: 24 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function Meetings() {
  const { me } = useAuth();
  const q = useGet<any[]>(`/meetings?from=${today()}T00:00:00&to=${addDays(today(), 60)}T23:59:59`);
  const rsvp = useAction(([id, response]: [string, string]) => post(`/meetings/${id}/respond`, { response }), { invalidate: ['/meetings', '/home'] });
  const [nw, setNew] = useState<any>(null);
  const people = useGet<any[]>(nw ? '/meetings/people' : null);
  const save = useAction(() => {
    const start = new Date(`${nw.date}T${nw.start}:00`), end = new Date(start.getTime() + nw.mins * 60000);
    const body = { title: nw.title, location: nw.location, onlineUrl: nw.onlineUrl, description: nw.description, startAt: start.toISOString(), endAt: end.toISOString(), attendeeUserIds: nw.attendees };
    return nw.id ? patch(`/meetings/${nw.id}`, body) : post('/meetings', body);
  }, { invalidate: ['/meetings', '/home'], onDone: () => setNew(null), ok: 'Invites sent' });
  const upcoming = (q.data || []).filter((m) => new Date(m.endAt) >= new Date());
  const groups = upcoming.reduce((g: Record<string, any[]>, m) => { const k = new Date(m.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }); (g[k] ||= []).push(m); return g; }, {});
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {!q.data ? <Loading /> : !upcoming.length ? <Empty title="No upcoming meetings" icon="calendar-account" sub="Meetings you organise or are invited to show here." /> : Object.entries(groups).map(([day, list]) => (
          <Section key={day} title={day}>
            {list.map((m) => (
              <View key={m.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.line, gap: 6 }}>
                <Row>
                  <View style={{ width: 58 }}><T bold>{fmtTime(m.startAt)}</T><T muted small>{fmtTime(m.endAt)}</T></View>
                  <View style={{ flex: 1 }}><T bold>{m.title}</T><T muted small>{[m.location, `by ${m.isOrganizer ? 'you' : m.organizerName}`].filter(Boolean).join(' · ')}</T></View>
                  {m.myResponse && <Badge s={m.myResponse} />}
                </Row>
                <Row style={{ paddingLeft: 68, flexWrap: 'wrap' }}>
                  {m.onlineUrl && <Btn small kind="ghost" icon="link" title="Join" onPress={() => Linking.openURL(m.onlineUrl)} />}
                  {m.myResponse && m.myResponse !== 'ACCEPTED' && <Btn small title="Accept" onPress={() => rsvp.run([m.id, 'ACCEPTED'])} />}
                  {m.myResponse && m.myResponse !== 'DECLINED' && <Btn small kind="ghost" title="Decline" onPress={() => rsvp.run([m.id, 'DECLINED'])} />}
                  {m.isOrganizer && <T muted small>{m.attendees.filter((a: any) => a.response === 'ACCEPTED').length}/{m.attendees.length} accepted</T>}
                </Row>
              </View>))}
          </Section>))}
      </Screen>
      <Pressable onPress={() => setNew({ title: '', date: today(), start: '10:00', mins: 60, location: '', onlineUrl: '', description: '', attendees: [] })} style={{ position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
        <Icon name="plus" size={30} color="#fff" />
      </Pressable>
      <Sheet visible={!!nw} title="Schedule meeting" onClose={() => setNew(null)}>
        {nw && <>
          <Field label="Title" value={nw.title} onChangeText={(v) => setNew({ ...nw, title: v })} />
          <DateField label="Date" value={nw.date} min={today()} onChange={(v) => setNew({ ...nw, date: v })} />
          <T muted small>Start time</T><Chips value={nw.start} onChange={(v) => setNew({ ...nw, start: v })} options={TIMES.map((t) => [t, t] as [string, string])} />
          <T muted small>Duration</T><Chips value={String(nw.mins)} onChange={(v) => setNew({ ...nw, mins: Number(v) })} options={[['15', '15 min'], ['30', '30 min'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours']]} />
          <Field label="Location" value={nw.location} onChangeText={(v) => setNew({ ...nw, location: v })} />
          <Field label="Online link" value={nw.onlineUrl} onChangeText={(v) => setNew({ ...nw, onlineUrl: v })} autoCapitalize="none" keyboardType="url" />
          <Field label="Agenda" value={nw.description} onChangeText={(v) => setNew({ ...nw, description: v })} multiline />
          <T muted small>Invite ({nw.attendees.length})</T>
          <View style={{ backgroundColor: '#fff', borderRadius: 12 }}>{people.data?.filter((p) => p.userId !== me?.user.id).map((p) => {
            const on = nw.attendees.includes(p.userId);
            return <Pressable key={p.userId} onPress={() => setNew({ ...nw, attendees: on ? nw.attendees.filter((x: string) => x !== p.userId) : [...nw.attendees, p.userId] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={on ? C.brand : C.faint} /><T>{p.name}</T></Pressable>;
          })}</View>
          <Btn title={save.busy ? 'Sending…' : 'Send invites'} disabled={!nw.title || save.busy} onPress={() => save.run(undefined)} />
        </>}
      </Sheet>
    </View>
  );
}
