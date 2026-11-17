import { useState } from 'react';
import { View } from 'react-native';
import { patch, post } from '../src/api';
import { useAuth } from '../src/auth';
import { fmtShort } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Card, Chips, Empty, Field, Loading, Row, Screen, Section, Sheet, Stars, T } from '../src/ui';

export default function Performance() {
  const { me } = useAuth();
  const goals = useGet<any[]>('/performance/goals?mine=1');
  const reviews = useGet<any[]>('/performance/reviews?mine=1');
  const [goal, setGoal] = useState<any>(null);
  const [rev, setRev] = useState<any>(null);
  const saveGoal = useAction(() => (goal.id ? patch(`/performance/goals/${goal.id}`, { progress: goal.progress, status: goal.status }) : post('/performance/goals', { title: goal.title, description: goal.description, progress: 0 })), { invalidate: ['/performance'], onDone: () => setGoal(null) });
  const submit = useAction(() => post(`/performance/reviews/${rev.id}/self`, { rating: rev.rating, comment: rev.comment }), { ok: 'Self-review submitted', invalidate: ['/performance'], onDone: () => setRev(null) });
  return (
    <Screen refreshing={goals.isRefetching} onRefresh={() => { goals.refetch(); reviews.refetch(); }}>
      <Section title="My goals" action={<Btn small title="New" icon="plus" onPress={() => setGoal({ title: '', description: '' })} />}>
        {!goals.data ? <Loading /> : !goals.data.length ? <Empty title="No goals yet" icon="trophy-outline" /> : goals.data.map((g) => (
          <View key={g.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.line, gap: 6 }}>
            <Row><T bold style={{ flex: 1 }} >{g.title}</T><Badge s={g.status} /></Row>
            <View style={{ height: 8, backgroundColor: '#eee', borderRadius: 4 }}><View style={{ height: 8, width: `${g.progress}%`, backgroundColor: C.brand, borderRadius: 4 }} /></View>
            <Row><T muted small style={{ flex: 1 }}>{g.progress}%{g.dueDate ? ` · due ${fmtShort(g.dueDate)}` : ''}</T><Btn small kind="ghost" title="Update" onPress={() => setGoal({ ...g })} /></Row>
          </View>))}
      </Section>
      <Section title="My reviews">
        {!reviews.data ? <Loading /> : !reviews.data.length ? <Empty title="No reviews yet" icon="account-tie" /> : reviews.data.map((r) => (
          <Card key={r.id} style={{ gap: 6, backgroundColor: '#f8f8f5', shadowOpacity: 0 }}>
            <Row><T bold style={{ flex: 1 }}>{r.cycleName}</T><Badge s={r.status} /></Row>
            {r.selfRating ? <Row><T muted small>Self</T><Stars value={r.selfRating} /></Row> : null}
            {r.managerRating ? <><Row><T muted small>Manager</T><Stars value={r.managerRating} /></Row>{!!r.managerComment && <T small>{r.managerComment}</T>}</> : null}
            {r.status === 'SELF_REVIEW' && r.cycleStatus === 'ACTIVE' && r.employeeId === me?.employee?.id && <Btn small title="Write self-assessment" onPress={() => setRev({ id: r.id, rating: 0, comment: '' })} />}
          </Card>))}
      </Section>
      <Sheet visible={!!goal} title={goal?.id ? 'Update goal' : 'New goal'} onClose={() => setGoal(null)}>
        {goal && (goal.id ? <>
          <T bold>{goal.title}</T>
          <T muted small>Progress: {goal.progress}%</T>
          <Chips value={String(goal.progress)} onChange={(v) => setGoal({ ...goal, progress: Number(v) })} options={[0, 10, 25, 40, 50, 60, 75, 90, 100].map((n) => [String(n), `${n}%`] as [string, string])} />
          <Chips value={goal.status} onChange={(v) => setGoal({ ...goal, status: v })} options={[['ON_TRACK', 'On track'], ['AT_RISK', 'At risk'], ['BEHIND', 'Behind'], ['DONE', 'Done']]} />
          <Btn title="Save" onPress={() => saveGoal.run(undefined)} />
        </> : <>
          <Field label="Goal" value={goal.title} onChangeText={(v) => setGoal({ ...goal, title: v })} />
          <Field label="Details" value={goal.description} onChangeText={(v) => setGoal({ ...goal, description: v })} multiline />
          <Btn title="Create goal" disabled={goal.title.length < 2} onPress={() => saveGoal.run(undefined)} />
        </>)}
      </Sheet>
      <Sheet visible={!!rev} title="Self-assessment" onClose={() => setRev(null)}>
        {rev && <>
          <T>How would you rate your performance this cycle?</T>
          <Stars value={rev.rating} onChange={(n) => setRev({ ...rev, rating: n })} />
          <Field label="Achievements, strengths and areas to grow" value={rev.comment} onChangeText={(v) => setRev({ ...rev, comment: v })} multiline />
          <Btn title="Submit" disabled={!rev.rating || submit.busy} onPress={() => submit.run(undefined)} />
        </>}
      </Sheet>
    </Screen>
  );
}
