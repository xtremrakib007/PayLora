import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { clock } from './clock';
import { fmtMins, fmtTime } from './format';
import { useAction } from './hooks';
import { C } from './theme';
import { Btn, Row } from './ui';

export function ClockCard({ today, shift }: { today: any; shift?: any }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  const act = useAction((a: 'in' | 'out') => clock(a), { invalidate: ['/home', '/me/attendance'] });
  const inAt = today?.clockIn, outAt = today?.clockOut;
  const worked = inAt ? ((outAt ? new Date(outAt) : now).getTime() - new Date(inAt).getTime()) / 3600000 : 0;
  return (
    <View style={{ backgroundColor: C.side, borderRadius: 20, padding: 18, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: '#a9cfc5', fontWeight: '700', fontSize: 12 }}>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}</Text>
          <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        {shift && <View style={{ backgroundColor: shift.color, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{shift.name}</Text><Text style={{ color: '#fff', fontSize: 11 }}>{shift.start}–{shift.end}</Text></View>}
      </Row>
      <Text style={{ color: '#cfe7e0' }}>
        {inAt ? `In ${fmtTime(inAt)}${outAt ? ` · Out ${fmtTime(outAt)}` : ''} · ${worked.toFixed(1)} h${today.lateMinutes ? ` · ${fmtMins(today.lateMinutes)} late` : today.late ? ' · late' : ''}` : 'You have not clocked in today.'}
      </Text>
      {!outAt && <Btn kind="light" icon="fingerprint" title={act.busy ? 'Getting location…' : inAt ? 'Clock out' : 'Clock in'} disabled={act.busy} onPress={() => act.run(inAt ? 'out' : 'in')} />}
    </View>
  );
}
