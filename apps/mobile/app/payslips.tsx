import { useState } from 'react';
import { Text, View } from 'react-native';
import { downloadAndShare } from '../src/api';
import { fmtMins, monthLabel, money, num } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Badge, Btn, Empty, Icon, ListItem, Loading, Row, Screen, Section, Sheet, T } from '../src/ui';

export default function Payslips() {
  const q = useGet<any[]>('/payslips/mine');
  const [open, setOpen] = useState<any>(null);
  const dl = useAction((p: any) => downloadAndShare(`/payslips/${p.id}/pdf`, `Payslip_${p.period}.pdf`));
  const d = open?.data;
  const Li = ({ k, v, bold }: { k: string; v: number; bold?: boolean }) => <Row style={{ justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: C.line }}><T bold={bold} style={{ flex: 1 }}>{k}</T><T bold={bold}>{v < 0 ? '−' + num(-v) : num(v)}</T></Row>;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {!q.data ? <Loading /> : !q.data.length ? <Empty title="No payslips yet" sub="They appear here once HR finalizes payroll." icon="file-document-outline" /> : <>
        <View style={{ backgroundColor: C.side, borderRadius: 18, padding: 18 }}>
          <Text style={{ color: '#a9cfc5', fontWeight: '700', fontSize: 12 }}>LATEST · {monthLabel(q.data[0].period).toUpperCase()}</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{money(q.data[0].net)}</Text>
          <Text style={{ color: '#cfe7e0' }}>Gross {money(q.data[0].gross)} · Deductions {money(q.data[0].totalDeductions)}</Text>
        </View>
        <Section title="All payslips">
          {q.data.map((p) => <ListItem key={p.id} left={<Icon name="file-document-outline" size={24} color={C.brand} />} title={monthLabel(p.period)} sub={`Net ${money(p.net)}`} right={<Badge s={p.status} />} onPress={() => setOpen(p)} />)}
        </Section>
      </>}
      <Sheet visible={!!open} title={open ? monthLabel(open.period) : ''} onClose={() => setOpen(null)}>
        {d && <>
          <View style={{ backgroundColor: C.brandLight, borderRadius: 14, padding: 16 }}><T muted small>NET PAY</T><Text style={{ fontSize: 30, fontWeight: '800', color: C.brandDark }}>{money(d.net)}</Text></View>
          <Section title="Earnings">
            <Li k="Basic salary" v={d.basic} />{d.allowances.map((a: any) => <Li key={a.name} k={a.name} v={a.amount} />)}
            {!!d.otPay && <Li k={`Overtime (${d.otHours} h)`} v={d.otPay} />}{!!d.bonus && <Li k="Bonus / commission" v={d.bonus} />}{!!d.otherEarnings && <Li k="Other earnings" v={d.otherEarnings} />}
            {!!d.unpaidDeduction && <Li k={`Unpaid leave / absence (${d.unpaidDays} d)`} v={-d.unpaidDeduction} />}{!!d.lateDeduction && <Li k={`Late arrival (${fmtMins(d.lateMinutes)})`} v={-d.lateDeduction} />}<Li k="Gross earnings" v={d.gross} bold />
          </Section>
          <Section title="Deductions">
            {d.statutory.filter((s: any) => s.employee).map((s: any) => <Li key={s.name} k={`${s.name} (employee)`} v={s.employee} />)}
            {!!d.tax && <Li k="Income tax (PCB)" v={d.tax} />}{d.deductions.map((x: any) => <Li key={x.name} k={x.name} v={x.amount} />)}{!!d.otherDeduction && <Li k="Other deduction" v={d.otherDeduction} />}
            <Li k="Total deductions" v={d.totalDeductions} bold />
          </Section>
          {d.reimbursements.length > 0 && <Section title="Reimbursements">{d.reimbursements.map((r: any) => <Li key={r.name} k={r.name} v={r.amount} />)}</Section>}
          {d.statutory.some((s: any) => s.employer) && <T muted small>Employer contributions: {d.statutory.filter((s: any) => s.employer).map((s: any) => `${s.name} ${num(s.employer)}`).join(' · ')}</T>}
          {!!d.note && <T muted small>Note: {d.note}</T>}
          <Btn icon="download" title={dl.busy ? 'Preparing PDF…' : 'Download / share PDF'} disabled={dl.busy} onPress={() => dl.run(open)} />
        </>}
      </Sheet>
    </Screen>
  );
}
