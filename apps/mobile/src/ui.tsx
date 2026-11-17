import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initials, titleCase } from './format';
import type { IconName } from './modules';
import { C, statusTone, TONE } from './theme';

export { MaterialCommunityIcons as Icon };

export function Screen({ children, refreshing, onRefresh, pad = true }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; pad?: boolean }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: pad ? 16 : 0, paddingBottom: 40, gap: 12 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} /> : undefined}>
      {children}
    </ScrollView>
  );
}
export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;
export const H = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[s.h, style]}>{children}</Text>;
export const T = ({ children, muted, small, bold, style, numberOfLines }: { children: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: object; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ color: muted ? C.muted : C.ink, fontSize: small ? 12.5 : 14.5, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>
);
export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>; }
export function Btn({ title, onPress, kind = 'primary', icon, disabled, small, style }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'light'; icon?: IconName; disabled?: boolean; small?: boolean; style?: ViewStyle }) {
  const bg = { primary: C.brand, ghost: '#fff', danger: C.bad, light: 'rgba(255,255,255,.95)' }[kind];
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'light' ? C.brandDark : C.ink;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1, paddingVertical: small ? 7 : 12, borderWidth: kind === 'ghost' ? 1 : 0 }, style]}>
      {icon && <MaterialCommunityIcons name={icon} size={small ? 15 : 18} color={fg} />}<Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}
export function Badge({ s: status, label }: { s?: string | null; label?: string }) {
  const [bg, fg] = TONE[statusTone(status)];
  return <View style={{ backgroundColor: bg, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: fg, fontSize: 11.5, fontWeight: '700' }}>{label ?? titleCase(status)}</Text></View>;
}
export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const colors = ['#0d6b5c', '#2357a6', '#8a4fbf', '#c0572b', '#1d7f48', '#a1702a'];
  const c = colors[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % colors.length];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials(name)}</Text></View>;
}
export const Loading = () => <ActivityIndicator color={C.brand} style={{ marginVertical: 30 }} />;
export function Empty({ title, sub, icon = 'inbox-arrow-down' }: { title: string; sub?: string; icon?: IconName }) {
  return <View style={{ alignItems: 'center', paddingVertical: 34, gap: 6 }}><MaterialCommunityIcons name={icon} size={34} color={C.faint} /><T bold>{title}</T>{sub && <T muted small style={{ textAlign: 'center' }}>{sub}</T>}</View>;
}
export function ListItem({ title, sub, right, onPress, left }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onPress?: () => void; left?: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.li, pressed && { opacity: 0.7 }]}>
      {left}<View style={{ flex: 1 }}>{typeof title === 'string' ? <T bold>{title}</T> : title}{sub != null && (typeof sub === 'string' ? <T muted small>{sub}</T> : sub)}</View>{right}
    </Pressable>
  );
}
export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return <View style={{ gap: 5 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor={C.faint} {...p} style={[s.input, p.multiline && { minHeight: 80, textAlignVertical: 'top' }, p.style]} /></View>;
}
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map(([v, l]) => <Pressable key={v} onPress={() => onChange(v)} style={[s.chip, v === value && { backgroundColor: C.brand, borderColor: C.brand }]}><Text style={{ color: v === value ? '#fff' : C.ink, fontWeight: '600', fontSize: 13 }}>{l}</Text></Pressable>)}
    </ScrollView>
  );
}
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        <Row style={{ padding: 16, paddingBottom: 6 }}><H style={{ flex: 1 }}>{title}</H><Pressable onPress={onClose} hitSlop={12}><MaterialCommunityIcons name="close" size={24} color={C.muted} /></Pressable></Row>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
export function Stars({ value, onChange }: { value?: number | null; onChange?: (n: number) => void }) {
  return <Row style={{ gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}><MaterialCommunityIcons name={(value || 0) >= n ? 'star' : 'star-outline'} size={onChange ? 32 : 18} color={(value || 0) >= n ? '#e8a21c' : C.faint} /></Pressable>)}</Row>;
}
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <Card><Row style={{ marginBottom: 6 }}><H style={{ flex: 1, fontSize: 16 }}>{title}</H>{action}</Row>{children}</Card>;
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  h: { fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 16, borderColor: C.line },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  label: { fontSize: 12.5, fontWeight: '600', color: C.muted },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
});

/** Pure-JS date field with a month calendar (no native picker dependency). */
export function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const y = +month.slice(0, 4), m = +month.slice(5, 7) - 1;
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const shift = (k: number) => { const d = new Date(y, m + k, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  return (
    <View style={{ gap: 5 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => { setMonth(value.slice(0, 7)); setOpen(true); }} style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <MaterialCommunityIcons name="calendar-month" size={18} color={C.muted} /><Text style={{ fontSize: 15, color: C.ink }}>{new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.35)', justifyContent: 'center', padding: 20 }} onPress={() => setOpen(false)}>
          <Pressable style={[s.card, { padding: 14 }]} onPress={() => undefined}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Pressable onPress={() => shift(-1)} hitSlop={10}><MaterialCommunityIcons name="chevron-left" size={26} color={C.ink} /></Pressable>
              <T bold>{new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</T>
              <Pressable onPress={() => shift(1)} hitSlop={10}><MaterialCommunityIcons name="chevron-right" size={26} color={C.ink} /></Pressable>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={{ width: '14.28%', textAlign: 'center', color: C.faint, fontWeight: '700', paddingVertical: 4 }}>{d}</Text>)}
              {cells.map((d, i) => {
                const dis = !d || (!!min && iso(d) < min), sel = d && iso(d) === value;
                return (
                  <Pressable key={i} disabled={dis} onPress={() => { onChange(iso(d!)); setOpen(false); }} style={{ width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                    {d ? <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? C.brand : 'transparent' }}><Text style={{ color: sel ? '#fff' : dis ? '#ccc' : C.ink, fontWeight: sel ? '800' : '500' }}>{d}</Text></View> : null}
                  </Pressable>);
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
