import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Avatar, Empty, Icon, ListItem, Loading, Row, s, Screen } from '../src/ui';

export default function Directory() {
  const [q, setQ] = useState('');
  const list = useGet<any[]>(`/employees?q=${encodeURIComponent(q)}`);
  return (
    <Screen>
      <TextInput style={s.input} placeholder="Search people…" placeholderTextColor={C.faint} value={q} onChangeText={setQ} />
      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
        {!list.data ? <Loading /> : !list.data.length ? <Empty title="No one found" icon="account-group" /> : list.data.map((e) => (
          <ListItem key={e.id} left={<Avatar name={e.name} />} title={e.name} sub={[e.designation, e.departmentName].filter(Boolean).join(' · ')}
            right={<Row>{e.phone && <Icon name="phone" size={22} color={C.brand} onPress={() => Linking.openURL(`tel:${e.phone}`)} />}{e.email && <Icon name="email-outline" size={22} color={C.brand} onPress={() => Linking.openURL(`mailto:${e.email}`)} />}</Row>} />))}
      </View>
    </Screen>
  );
}
