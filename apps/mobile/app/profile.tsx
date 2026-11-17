import { useEffect, useState } from 'react';
import { patch, post } from '../src/api';
import { fmtDate, titleCase } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { Btn, Field, ListItem, Loading, Screen, Section, T } from '../src/ui';

export default function Profile() {
  const q = useGet<any>('/me/profile');
  const [f, setF] = useState<any>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  useEffect(() => { if (q.data && !f) setF({ phone: q.data.phone || '', address: q.data.address || '', emergencyName: q.data.emergencyName || '', emergencyPhone: q.data.emergencyPhone || '' }); }, [q.data]);
  const save = useAction(() => patch('/me/profile', f), { ok: 'Profile updated', invalidate: ['/me/profile'] });
  const change = useAction(() => post('/auth/password', pw), { ok: 'Password changed', onDone: () => setPw({ current: '', next: '' }) });
  const e = q.data;
  if (!e || !f) return <Loading />;
  return (
    <Screen>
      <Section title={e.name}>
        <ListItem title="Employee code" right={<T>{e.code}</T>} />
        <ListItem title="Designation" right={<T>{e.designation || '—'}</T>} />
        <ListItem title="Department" right={<T>{e.departmentName || '—'}</T>} />
        <ListItem title="Joined" right={<T>{fmtDate(e.joinDate)}</T>} />
        <ListItem title="Type" right={<T>{titleCase(e.type)}</T>} />
        <ListItem title="Reports to" right={<T>{e.manager?.name || '—'}</T>} />
      </Section>
      <Section title="Contact details">
        <Field label="Phone" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" />
        <Field label="Address" value={f.address} onChangeText={(v) => setF({ ...f, address: v })} multiline />
        <Field label="Emergency contact" value={f.emergencyName} onChangeText={(v) => setF({ ...f, emergencyName: v })} />
        <Field label="Emergency phone" value={f.emergencyPhone} onChangeText={(v) => setF({ ...f, emergencyPhone: v })} keyboardType="phone-pad" />
        <Btn title="Save" onPress={() => save.run(undefined)} style={{ marginTop: 10 }} />
      </Section>
      <Section title="Change password">
        <Field label="Current password" value={pw.current} onChangeText={(v) => setPw({ ...pw, current: v })} secureTextEntry />
        <Field label="New password (8+ characters)" value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} secureTextEntry />
        <Btn title="Change password" disabled={pw.next.length < 8} onPress={() => change.run(undefined)} style={{ marginTop: 10 }} />
      </Section>
    </Screen>
  );
}
