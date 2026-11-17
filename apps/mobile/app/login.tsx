import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, get, post } from '../src/api';
import { useAuth } from '../src/auth';
import { C } from '../src/theme';
import { Btn, Card, Chips, Field, Icon, T } from '../src/ui';

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'invite'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [link, setLink] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const tokenFromLink = () => link.trim().split('/invite/').pop()!.split(/[?#]/)[0];

  const run = async (fn: () => Promise<void>) => { setErr(''); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const login = () => run(async () => { const r = await post<{ token: string }>('/auth/login', { email: email.trim(), password }); await signIn(r.token); });
  const check = () => run(async () => setInvite(await get(`/auth/invite/${tokenFromLink()}`)));
  const accept = () => run(async () => { const r = await post<{ token: string }>('/auth/accept-invite', { token: tokenFromLink(), name: name || undefined, password }); await signIn(r.token); });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.side }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}><Icon name="hand-wave" size={32} color="#fff" /></View>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>Workwise HR</Text>
            <Text style={{ color: '#a9cfc5', textAlign: 'center' }}>Clock in, payslips, leave, tasks and meetings — in your pocket.</Text>
          </View>
          <Card style={{ gap: 14 }}>
            <Chips value={mode} onChange={(m) => { setMode(m); setErr(''); }} options={[['login', 'Sign in'], ['invite', 'I have an invite']]} />
            {!!err && <View style={{ backgroundColor: C.badL, padding: 10, borderRadius: 10 }}><T style={{ color: C.bad }}>{err}</T></View>}
            {mode === 'login' ? <>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
              <Btn title={busy ? 'Signing in…' : 'Sign in'} onPress={login} disabled={busy || !email || !password} />
            </> : !invite ? <>
              <Field label="Invitation link from HR" value={link} onChangeText={setLink} autoCapitalize="none" placeholder="https://…/invite/…" />
              <Btn title="Continue" onPress={check} disabled={busy || link.length < 10} />
            </> : <>
              <T>Join <T bold>{invite.company}</T> as {invite.role.toLowerCase()} ({invite.email})</T>
              {!invite.hasAccount && <Field label="Your name" value={name} onChangeText={setName} />}
              <Field label={invite.hasAccount ? 'Your existing password' : 'Choose a password (8+ characters)'} value={password} onChangeText={setPassword} secureTextEntry />
              <Btn title={busy ? 'Joining…' : 'Accept & sign in'} onPress={accept} disabled={busy || password.length < 8} />
            </>}
          </Card>
          <Text style={{ color: '#6f918a', textAlign: 'center', fontSize: 11 }}>Server: {API_URL}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
