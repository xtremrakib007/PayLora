import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { post } from '../src/api';
import { ago } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Avatar, Badge, Btn, Card, Empty, Icon, Loading, Row, s, Screen, T } from '../src/ui';

export default function Feed() {
  const q = useGet<any[]>('/feed');
  const [text, setText] = useState('');
  const create = useAction(() => post('/feed', { content: text }), { invalidate: ['/feed'], onDone: () => setText('') });
  const like = useAction((id: string) => post(`/feed/${id}/like`), { invalidate: ['/feed'] });
  const comment = useAction(([id, c]: [string, string]) => post(`/feed/${id}/comments`, { content: c }), { invalidate: ['/feed'] });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Card style={{ gap: 10 }}>
        <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Share something with your team…" placeholderTextColor={C.faint} multiline value={text} onChangeText={setText} />
        <Btn title="Post" small disabled={!text.trim() || create.busy} onPress={() => create.run(undefined)} />
      </Card>
      {!q.data ? <Loading /> : !q.data.length ? <Empty title="Nothing here yet" icon="newspaper-variant-outline" /> : q.data.map((p) => <Post key={p.id} p={p} onLike={() => like.run(p.id)} onComment={(c) => comment.run([p.id, c])} />)}
    </Screen>
  );
}

function Post({ p, onLike, onComment }: { p: any; onLike: () => void; onComment: (c: string) => void }) {
  const [c, setC] = useState('');
  return (
    <Card style={{ gap: 10 }}>
      <Row><Avatar name={p.authorName} /><View style={{ flex: 1 }}><T bold>{p.authorName}</T><T muted small>{ago(p.createdAt)}</T></View>{p.announcement && <Badge s="PENDING" label="📣 Announcement" />}</Row>
      <T>{p.content}</T>
      <Row><Pressable onPress={onLike} hitSlop={8}><Row style={{ gap: 4 }}><Icon name={p.liked ? 'heart' : 'heart-outline'} size={20} color={p.liked ? C.bad : C.muted} /><T muted small>{p.likes}</T></Row></Pressable>
        <Row style={{ gap: 4 }}><Icon name="comment-outline" size={19} color={C.muted} /><T muted small>{p.commentCount}</T></Row></Row>
      {p.comments.map((x: any) => <View key={x.id} style={{ backgroundColor: '#f4f4f0', borderRadius: 10, padding: 8 }}><T small><T small bold>{x.authorName} </T>{x.content}</T></View>)}
      <TextInput style={[s.input, { paddingVertical: 8 }]} placeholder="Write a comment…" placeholderTextColor={C.faint} value={c} onChangeText={setC} returnKeyType="send" onSubmitEditing={() => { if (c.trim()) { onComment(c); setC(''); } }} />
    </Card>
  );
}
