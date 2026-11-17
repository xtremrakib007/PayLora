import { ReactNode, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { post, tokenStore } from './lib/api';
import { useAuth } from './lib/auth';
import { Layout, ModuleGate } from './components/Layout';
import { Field, Spinner } from './components/ui';
import { AcceptInvite, Login, Register } from './pages/Auth';
import { Careers } from './pages/Careers';
import { Home } from './pages/Home';
import { Departments, Employees, MyProfile } from './pages/People';
import { Attendance, Leave, Shifts, Timesheets } from './pages/Time';
import { Claims, MyPayslips, Payroll } from './pages/Money';
import { JobBoard, Onboarding, Performance, Recruitment, Training } from './pages/Grow';
import { Feed, Meetings, Notifications, Services, Surveys, Tasks } from './pages/Engage';
import { Billing, Reports, Settings, SuperAdmin, Team } from './pages/Admin';
import type { Role } from './lib/modules';

function Protected({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (!tokenStore.get()) return <Navigate to="/login" replace />;
  if (loading || !me) return <Spinner />;
  if (!me.company) return me.user.platformRole === 'SUPER_ADMIN' ? <div className="content" style={{ paddingTop: 24 }}><SuperAdmin /></div> : <NoCompany />;
  return <>{children}</>;
}

function NoCompany() {
  const { signIn, signOut } = useAuth();
  const [name, setName] = useState('');
  return (
    <div style={{ maxWidth: 420, margin: '12vh auto', padding: 16 }} className="card">
      <h3>You're not part of a company yet</h3>
      <p className="muted">Ask your HR to send you an invitation link, or create your own workspace.</p>
      <Field label="Company name"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={signOut}>Sign out</button><span className="grow" />
        <button className="btn primary" disabled={name.length < 2} onClick={async () => { const r = await post<{ token: string }>('/auth/companies', { name }); await signIn(r.token); location.href = '/'; }}>Create workspace</button></div>
    </div>
  );
}

function Need({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : <div className="card"><div className="empty"><b>You don't have access to this page</b></div></div>;
}

const M = (module: string, el: ReactNode, roles?: Role[]) => <ModuleGate module={module}>{roles ? <Need roles={roles}>{el}</Need> : el}</ModuleGate>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/careers/:slug" element={<Careers />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="employees" element={M('profiles', <Employees />)} />
        <Route path="departments" element={M('profiles', <Departments />, ['OWNER', 'HR'])} />
        <Route path="me/profile" element={<MyProfile />} />
        <Route path="attendance" element={M('attendance', <Attendance />)} />
        <Route path="leave" element={M('leave', <Leave />)} />
        <Route path="timesheets" element={M('timesheets', <Timesheets />)} />
        <Route path="shifts" element={M('shifts', <Shifts />)} />
        <Route path="payroll" element={M('payroll', <Payroll />, ['OWNER', 'HR'])} />
        <Route path="me/payslips" element={M('payroll', <MyPayslips />)} />
        <Route path="claims" element={M('claims', <Claims />)} />
        <Route path="recruitment" element={M('recruitment', <Recruitment />, ['OWNER', 'HR', 'MANAGER'])} />
        <Route path="recruitment/jobs" element={M('recruitment', <JobBoard />, ['OWNER', 'HR', 'MANAGER'])} />
        <Route path="onboarding" element={M('onboarding', <Onboarding />)} />
        <Route path="performance" element={M('performance', <Performance />)} />
        <Route path="training" element={M('training', <Training />)} />
        <Route path="feed" element={M('feed', <Feed />)} />
        <Route path="surveys" element={M('surveys', <Surveys />)} />
        <Route path="services" element={M('services', <Services />)} />
        <Route path="tasks" element={M('tasks', <Tasks />)} />
        <Route path="meetings" element={M('meetings', <Meetings />)} />
        <Route path="reports" element={M('reporting', <Reports />, ['OWNER', 'HR'])} />
        <Route path="team" element={<Need roles={['OWNER', 'HR']}><Team /></Need>} />
        <Route path="settings" element={<Need roles={['OWNER', 'HR']}><Settings /></Need>} />
        <Route path="billing" element={<Need roles={['OWNER', 'HR']}><Billing /></Need>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="admin" element={<SuperAdmin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
