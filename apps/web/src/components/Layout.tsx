import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useGet } from '../lib/hooks';
import { APPS, isAdmin } from '../lib/modules';
import { Icon } from './Icon';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'], [/^\/employees/, 'Profiles'], [/^\/departments/, 'Departments'], [/^\/attendance/, 'Attendance'], [/^\/leave/, 'Leave'], [/^\/timesheets/, 'Timesheets'],
  [/^\/shifts/, 'Shifts'], [/^\/payroll/, 'Payroll'], [/^\/me\/payslips/, 'My payslips'], [/^\/claims/, 'Claims'], [/^\/recruitment\/jobs/, 'Job Board'], [/^\/recruitment/, 'Recruitment'],
  [/^\/onboarding/, 'Onboarding'], [/^\/performance/, 'Performance'], [/^\/training/, 'Training'], [/^\/feed/, 'Feed'], [/^\/surveys/, 'Surveys'], [/^\/services/, 'Services'],
  [/^\/tasks/, 'Tasks'], [/^\/meetings/, 'Meetings'], [/^\/reports/, 'Reporting'], [/^\/team/, 'Team & access'], [/^\/settings/, 'Settings'], [/^\/billing/, 'Billing'],
  [/^\/notifications/, 'Notifications'], [/^\/admin/, 'Platform admin'], [/^\/me\/profile/, 'My profile'],
];

export function Layout() {
  const { me, has, can, switchCompany, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useGet<{ count: number }>(me?.company ? '/notifications/unread-count' : null, { refetchInterval: 60_000 });
  useEffect(() => setOpen(false), [loc.pathname]);
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? '';
  const apps = APPS.filter((a) => has(a.module) && (!a.roles || (me?.role && a.roles.includes(me.role))));

  const Item = ({ to, icon, children }: { to: string; icon: string; children: ReactNode }) => (
    <NavLink to={to} end={to === '/'}><Icon name={icon} size={18} />{children}</NavLink>
  );

  return (
    <div className={'shell' + (open ? ' nav-open' : '')}>
      <aside className="side">
        <div className="brand"><div className="logo"><Icon name="check" size={18} color="#fff" /></div>PayLora</div>
        {me && me.memberships.length > 1 && (
          <select className="cosel" value={me.company?.id} onChange={(e) => switchCompany(e.target.value)}>
            {me.memberships.map((m) => <option key={m.companyId} value={m.companyId}>{m.name}</option>)}
          </select>
        )}
        <nav className="nav">
          <Item to="/" icon="home">Home</Item>
          <div className="sec">Apps</div>
          {apps.map((a) => <Item key={a.key} to={a.path} icon={a.icon}>{a.title}</Item>)}
          {isAdmin(me?.role) && <>
            <div className="sec">Company</div>
            {has('profiles') && <Item to="/departments" icon="dept">Departments</Item>}
            <Item to="/team" icon="team">Team & access</Item>
            <Item to="/settings" icon="settings">Settings</Item>
            {can('OWNER') && <Item to="/billing" icon="billing">Billing</Item>}
          </>}
          {me?.user.platformRole === 'SUPER_ADMIN' && <><div className="sec">Platform</div><Item to="/admin" icon="admin">Super admin</Item></>}
        </nav>
        <div className="foot">
          <Link to="/me/profile" style={{ color: '#fff', fontWeight: 700 }}>{me?.user.name}</Link>
          <div style={{ color: '#7fa39b', fontSize: 11.5, marginBottom: 8 }}>{me?.company?.name} · {me?.role?.toLowerCase()}</div>
          <button className="btn sm ghost" style={{ color: '#c9dcd6', padding: 0 }} onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <main>
        <header className="topbar">
          <button className="iconbtn hamb" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <h1 className="grow">{title}</h1>
          <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications">
            <Icon name="bell" />{!!unread.data?.count && <span className="dotc">{unread.data.count > 99 ? '99+' : unread.data.count}</span>}
          </button>
        </header>
        <div className="content"><Outlet /></div>
      </main>
    </div>
  );
}

/** Wrap module pages: shows an upgrade prompt when the module isn't available. */
export function ModuleGate({ module, children }: { module: string; children: ReactNode }) {
  const { has, can } = useAuth();
  if (has(module)) return <>{children}</>;
  return (
    <div className="card"><div className="empty"><b>This app isn't enabled for your company</b>
      {can('OWNER') ? <>Upgrade your plan to use it. <div style={{ marginTop: 12 }}><Link className="btn primary" to="/billing">See plans</Link></div></> : 'Ask your company owner to upgrade the plan.'}
    </div></div>
  );
}
