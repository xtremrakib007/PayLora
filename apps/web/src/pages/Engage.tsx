import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, ago, fmtShort, titleCase, today } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { isAdmin, isManager } from '../lib/modules';
import { Avatar, Badge, Empty, Field, Modal, Seg, Spinner, Stars, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';

/* ───────── Feed ───────── */
export function Feed() {
  const { me } = useAuth();
  const q = useGet<any[]>('/feed');
  const [text, setText] = useState(''), [ann, setAnn] = useState(false);
  const postIt = useAction(() => post('/feed', { content: text, announcement: ann, pinned: ann }), { ok: ann ? 'Announcement sent to everyone' : 'Posted', invalidate: ['/feed', '/home'], onDone: () => { setText(''); setAnn(false); } });
  const like = useAction((id: string) => post(`/feed/${id}/like`), { invalidate: ['/feed'] });
  const remove = useAction((id: string) => del(`/feed/${id}`), { invalidate: ['/feed'] });
  const comment = useAction(([id, c]: [string, string]) => post(`/feed/${id}/comments`, { content: c }), { invalidate: ['/feed'] });
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <textarea className="inp" rows={3} placeholder={`Share something with ${me?.company?.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>{isAdmin(me?.role) && <label className="row small"><input type="checkbox" checked={ann} onChange={(e) => setAnn(e.target.checked)} /> Announcement (pin + notify everyone)</label>}
          <span className="grow" /><button className="btn primary" disabled={!text.trim() || postIt.busy} onClick={() => postIt.run(undefined)}>Post</button></div>
      </div>
      <div className="card">
        {!q.data ? <Spinner /> : !q.data.length ? <Empty title="Nothing here yet" /> : q.data.map((p) => <Post key={p.id} p={p} canDelete={p.mine || isAdmin(me?.role)} onLike={() => like.run(p.id)} onDelete={() => remove.run(p.id)} onComment={(c) => comment.run([p.id, c])} />)}
      </div>
    </div>
  );
}

function Post({ p, canDelete, onLike, onDelete, onComment }: { p: any; canDelete: boolean; onLike: () => void; onDelete: () => void; onComment: (c: string) => void }) {
  const [c, setC] = useState('');
  return (
    <div className="post">
      <div className="row"><Avatar name={p.authorName} id={p.authorId} /><div className="grow"><b>{p.authorName}</b><div className="small faint">{ago(p.createdAt)}</div></div>
        {p.announcement && <span className="badge warn">📣 Announcement</span>}{p.pinned && <span className="badge brand">Pinned</span>}
        {canDelete && <button className="btn sm ghost" onClick={onDelete}>Delete</button>}</div>
      <p style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>{p.content}</p>
      <div className="row small"><button className="btn sm ghost" onClick={onLike} style={{ color: p.liked ? 'var(--bad)' : undefined }}><Icon name="heart" size={14} /> {p.likes}</button><span className="faint"><Icon name="chat" size={14} /> {p.commentCount}</span></div>
      {p.comments.map((x: any) => <div key={x.id} className="small" style={{ background: '#f6f6f2', borderRadius: 10, padding: '6px 10px', marginTop: 6 }}><b>{x.authorName}</b> {x.content}</div>)}
      <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }}><input className="inp" placeholder="Write a comment…" value={c} onChange={(e) => setC(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && c.trim()) { onComment(c); setC(''); } }} /></div>
    </div>
  );
}

/* ───────── Surveys ───────── */
export function Surveys() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role);
  const q = useGet<any[]>('/surveys');
  const [take, setTake] = useState<any>(null), [results, setResults] = useState<string | null>(null), [build, setBuild] = useState<any>(null);
  const status = useAction(([id, s]: [string, string]) => patch(`/surveys/${id}`, { status: s }), { ok: 'Updated', invalidate: ['/surveys'] });
  return (
    <div className="card">
      <div className="tools"><span className="grow" />{admin && <button className="btn primary" onClick={() => setBuild({ title: '', description: '', anonymous: true, questions: [{ id: 'q1', type: 'rating', label: '' }] })}><Icon name="plus" size={16} />New survey</button>}</div>
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No surveys" /> : q.data.map((s) => (
        <div className="list-row" key={s.id}>
          <div className="grow"><b>{s.title}</b><div className="small muted">{s.questions.length} questions · {s.anonymous ? 'anonymous' : 'named'}{admin ? ` · ${s.responses} responses` : ''}</div></div>
          <Badge s={s.status} />
          {s.status === 'OPEN' && !s.answered && <button className="btn sm primary" onClick={() => setTake(s)}>Take survey</button>}
          {s.answered && <span className="badge ok">Answered</span>}
          {admin && <>{s.status === 'DRAFT' && <button className="btn sm" onClick={() => status.run([s.id, 'OPEN'])}>Open</button>}{s.status === 'OPEN' && <button className="btn sm" onClick={() => status.run([s.id, 'CLOSED'])}>Close</button>}<button className="btn sm" onClick={() => setResults(s.id)}>Results</button></>}
        </div>))}
      {take && <TakeSurvey s={take} onClose={() => setTake(null)} />}
      {results && <Results id={results} onClose={() => setResults(null)} />}
      {build && <BuildSurvey s={build} onClose={() => setBuild(null)} />}
    </div>
  );
}

function TakeSurvey({ s, onClose }: { s: any; onClose: () => void }) {
  const [a, setA] = useState<Record<string, any>>({});
  const send = useAction(() => post(`/surveys/${s.id}/responses`, { answers: a }), { ok: 'Thanks for your feedback!', invalidate: ['/surveys'], onDone: onClose });
  return (
    <Modal title={s.title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => send.run(undefined)}>Submit</button></>}>
      {s.anonymous && <div className="banner info">This survey is anonymous.</div>}
      <div className="stack">{s.questions.map((q: any) => (
        <Field key={q.id} label={q.label}>
          {q.type === 'rating' && <Stars value={a[q.id]} onChange={(n) => setA({ ...a, [q.id]: n })} />}
          {q.type === 'choice' && <div className="row">{q.options.map((o: string) => <label key={o} className="row small"><input type="radio" name={q.id} checked={a[q.id] === o} onChange={() => setA({ ...a, [q.id]: o })} />{o}</label>)}</div>}
          {q.type === 'text' && <textarea className="inp" rows={3} value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} />}
        </Field>))}</div>
    </Modal>
  );
}

function Results({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useGet<any>(`/surveys/${id}/results`);
  return (
    <Modal wide title={q.data ? `${q.data.survey.title} · ${q.data.responses} responses` : 'Results'} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {!q.data ? <Spinner /> : <div className="stack">{q.data.questions.map((x: any) => (
        <div key={x.id} className="card" style={{ background: '#f7f7f3', boxShadow: 'none', margin: 0 }}><b>{x.label}</b>
          {x.type === 'rating' && <div><div style={{ fontSize: 24, fontWeight: 800 }}>{x.average ?? '—'} <span className="small faint">/ 5 · {x.count} answers</span></div>
            {x.distribution.map((n: number, i: number) => <div key={i} className="row small" style={{ flexWrap: 'nowrap' }}><span style={{ width: 20 }}>{i + 1}★</span><div className="bar grow"><i style={{ width: (x.count ? (n / x.count) * 100 : 0) + '%' }} /></div><span style={{ width: 24 }}>{n}</span></div>)}</div>}
          {x.type === 'choice' && x.tally.map((t: any) => <div key={t.option} className="row small" style={{ flexWrap: 'nowrap', marginTop: 4 }}><span style={{ width: 120 }}>{t.option}</span><div className="bar grow"><i style={{ width: (x.count ? (t.count / x.count) * 100 : 0) + '%' }} /></div><span style={{ width: 24 }}>{t.count}</span></div>)}
          {x.type === 'text' && (x.answers.length ? x.answers.map((t: any, i: number) => <div key={i} className="list-row small">“{t.text}”{t.by && <span className="faint">— {t.by}</span>}</div>) : <div className="muted small">No answers</div>)}
        </div>))}</div>}
    </Modal>
  );
}

function BuildSurvey({ s, onClose }: { s: any; onClose: () => void }) {
  const [f, setF] = useState<any>(s);
  const save = useAction((status: string) => post('/surveys', { ...f, status, questions: f.questions.map((q: any) => ({ ...q, options: q.type === 'choice' ? String(q.optionsText || '').split(',').map((x: string) => x.trim()).filter(Boolean) : undefined, optionsText: undefined })) }),
    { ok: 'Survey saved', invalidate: ['/surveys'], onDone: onClose });
  const upd = (i: number, k: string, v: any) => setF({ ...f, questions: f.questions.map((q: any, j: number) => (j === i ? { ...q, [k]: v } : q)) });
  return (
    <Modal wide title="New survey" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save.run('DRAFT')}>Save draft</button><button className="btn primary" onClick={() => save.run('OPEN')}>Publish & notify</button></>}>
      <div className="form">
        <Field label="Title" full><input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <label className="full row"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> Anonymous responses</label>
      </div>
      <div className="stack" style={{ marginTop: 12, gap: 8 }}>
        {f.questions.map((q: any, i: number) => (
          <div key={q.id} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <select className="inp" style={{ width: 120 }} value={q.type} onChange={(e) => upd(i, 'type', e.target.value)}><option value="rating">Rating 1–5</option><option value="choice">Choice</option><option value="text">Text</option></select>
            <div className="grow stack" style={{ gap: 4 }}><input className="inp" placeholder="Question" value={q.label} onChange={(e) => upd(i, 'label', e.target.value)} />
              {q.type === 'choice' && <input className="inp" placeholder="Options, comma-separated" value={q.optionsText || ''} onChange={(e) => upd(i, 'optionsText', e.target.value)} />}</div>
            <button className="iconbtn" onClick={() => setF({ ...f, questions: f.questions.filter((_: any, j: number) => j !== i) })}><Icon name="close" size={16} /></button>
          </div>))}
        <div><button className="btn sm" onClick={() => setF({ ...f, questions: [...f.questions, { id: 'q' + (Date.now() % 100000), type: 'rating', label: '' }] })}>+ Add question</button></div>
      </div>
    </Modal>
  );
}

/* ───────── Services (HR helpdesk) ───────── */
export function Services() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role);
  const [status, setStatus] = useState('');
  const q = useGet<any[]>(`/services${status ? '?status=' + status : ''}`);
  const cats = useGet<string[]>('/services/categories');
  const [open, setOpen] = useState<string | null>(null), [nw, setNew] = useState<any>(null);
  const create = useAction(() => post('/services', nw), { ok: 'Request sent to HR', invalidate: ['/services'], onDone: () => setNew(null) });
  const cur = q.data?.find((r) => r.id === open);
  return (
    <div className="card">
      <div className="tools"><select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
        <span className="grow" />{me?.employee && <button className="btn primary" onClick={() => setNew({ category: cats.data?.[0] || 'Other', subject: '', body: '' })}><Icon name="plus" size={16} />New request</button>}</div>
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No requests">Ask HR for letters, payroll queries, equipment and more.</Empty> : q.data.map((r) => (
        <div className="list-row" key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r.id)}>
          <div className="grow"><b>{r.subject}</b><div className="small muted">{r.category}{admin ? ` · ${r.employeeName}` : ''} · updated {ago(r.updatedAt)} · {r.thread.length} repl{r.thread.length === 1 ? 'y' : 'ies'}</div></div><Badge s={r.status} />
        </div>))}
      {cur && <Ticket r={cur} admin={admin} onClose={() => setOpen(null)} />}
      {nw && (
        <Modal title="New request" onClose={() => setNew(null)} footer={<><button className="btn" onClick={() => setNew(null)}>Cancel</button><button className="btn primary" onClick={() => create.run(undefined)}>Send</button></>}>
          <div className="form">
            <Field label="Category" full><select className="inp" value={nw.category} onChange={(e) => setNew({ ...nw, category: e.target.value })}>{cats.data?.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Subject" full><input className="inp" value={nw.subject} onChange={(e) => setNew({ ...nw, subject: e.target.value })} /></Field>
            <Field label="Details" full><textarea className="inp" rows={5} value={nw.body} onChange={(e) => setNew({ ...nw, body: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Ticket({ r, admin, onClose }: { r: any; admin: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const reply = useAction(() => post(`/services/${r.id}/reply`, { text }), { invalidate: ['/services'], onDone: () => setText('') });
  const status = useAction((s: string) => patch(`/services/${r.id}/status`, { status: s }), { ok: 'Updated', invalidate: ['/services'] });
  return (
    <Modal wide title={r.subject} onClose={onClose} footer={<>
      {admin && r.status !== 'RESOLVED' && <button className="btn" onClick={() => status.run('RESOLVED')}>Mark resolved</button>}
      {r.status !== 'CLOSED' && <button className="btn" onClick={() => status.run('CLOSED')}>Close</button>}<button className="btn" onClick={onClose}>Done</button></>}>
      <div className="row small muted" style={{ marginBottom: 10 }}>{r.category} · {r.employeeName} · <Badge s={r.status} /></div>
      <div style={{ background: '#f6f6f2', borderRadius: 12, padding: 12, whiteSpace: 'pre-wrap' }}>{r.body}</div>
      {r.thread.map((m: any, i: number) => <div key={i} style={{ marginTop: 10, marginLeft: m.staff ? 0 : 40, marginRight: m.staff ? 40 : 0, background: m.staff ? 'var(--brand-l)' : '#f6f6f2', borderRadius: 12, padding: 10 }}>
        <div className="small"><b>{m.name}</b>{m.staff && <span className="badge brand" style={{ marginLeft: 6 }}>HR</span>} <span className="faint">{ago(m.at)}</span></div><div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div></div>)}
      {r.status !== 'CLOSED' && <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}><textarea className="inp" rows={2} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn primary" disabled={!text.trim()} onClick={() => reply.run(undefined)}>Send</button></div>}
    </Modal>
  );
}

/* ───────── Tasks ───────── */
const COLS = ['TODO', 'IN_PROGRESS', 'DONE'];
export function Tasks() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const [scope, setScope] = useState(mgr ? 'team' : 'mine');
  const q = useGet<any[]>(`/tasks?scope=${scope}`);
  const emps = useGet<any[]>('/employees?status=ACTIVE');
  const [edit, setEdit] = useState<any>(null);
  const move = useAction(([id, status]: [string, string]) => patch(`/tasks/${id}`, { status }), { invalidate: ['/tasks', '/home'] });
  return (
    <div className="stack">
      <div className="row"><Seg value={scope} onChange={setScope} options={[['mine', 'My tasks'], ...(mgr ? [['team', isAdmin(me?.role) ? 'All tasks' : 'My team']] as [string, string][] : [])]} />
        <span className="grow" /><button className="btn primary" onClick={() => setEdit({ title: '', description: '', assigneeId: me?.employee?.id || '', dueDate: '', priority: 'MEDIUM', status: 'TODO' })}><Icon name="plus" size={16} />New task</button></div>
      {!q.data ? <Spinner /> : (
        <div className="kanban" style={{ gridAutoColumns: 'minmax(260px,1fr)' }}>{COLS.map((c) => { const list = q.data!.filter((t) => t.status === c); return (
          <div className="kcol" key={c}><h4>{titleCase(c)} · {list.length}</h4>
            {list.map((t) => (
              <div className="kcard" key={t.id} onClick={() => setEdit(t)}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}><b>{t.title}</b><Badge s={t.priority} /></div>
                <div className="small muted">{t.assigneeName || 'Unassigned'}{t.dueDate ? ` · due ${fmtShort(t.dueDate)}` : ''}</div>
                {t.dueDate && t.dueDate < today() && t.status !== 'DONE' && <span className="badge bad" style={{ marginTop: 4 }}>Overdue</span>}
                <div className="row" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>{COLS.filter((x) => x !== c).map((x) => <button key={x} className="btn sm" onClick={() => move.run([t.id, x])}>→ {titleCase(x)}</button>)}</div>
              </div>))}
          </div>); })}
        </div>
      )}
      {edit && <TaskForm t={edit} emps={emps.data || []} onClose={() => setEdit(null)} canEdit={!edit.id || edit.createdById === me?.user.id || isManager(me?.role)} />}
    </div>
  );
}

function TaskForm({ t, emps, onClose, canEdit }: { t: any; emps: any[]; onClose: () => void; canEdit: boolean }) {
  const [f, setF] = useState({ ...t, assigneeId: t.assigneeId || '', dueDate: t.dueDate || '', description: t.description || '' });
  const confirm = useConfirm();
  const save = useAction(() => { const b = { title: f.title, description: f.description, assigneeId: f.assigneeId || null, dueDate: f.dueDate || null, priority: f.priority, status: f.status }; return t.id ? patch(`/tasks/${t.id}`, canEdit ? b : { status: f.status }) : post('/tasks', b); },
    { ok: 'Saved', invalidate: ['/tasks', '/home'], onDone: onClose });
  const remove = useAction(() => del(`/tasks/${t.id}`), { ok: 'Deleted', invalidate: ['/tasks'], onDone: onClose });
  const bind = (k: string) => ({ value: f[k] ?? '', disabled: !canEdit && k !== 'status', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal title={t.id ? 'Task' : 'New task'} onClose={onClose} footer={<>{t.id && canEdit && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: 'Delete this task?', danger: true, ok: 'Delete' })) && remove.run(undefined)}>Delete</button>}<button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></>}>
      <div className="form">
        <Field label="Title" full><input className="inp" {...bind('title')} /></Field>
        <Field label="Description" full><textarea className="inp" rows={3} {...bind('description')} /></Field>
        <Field label="Assignee"><select className="inp" {...bind('assigneeId')}><option value="">Unassigned</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Due date"><input className="inp" type="date" {...bind('dueDate')} /></Field>
        <Field label="Priority"><select className="inp" {...bind('priority')}>{['LOW', 'MEDIUM', 'HIGH'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</select></Field>
        <Field label="Status"><select className="inp" {...bind('status')}>{COLS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</select></Field>
      </div>
      {t.createdByName && <p className="small muted">Created by {t.createdByName}</p>}
    </Modal>
  );
}

/* ───────── Meetings ───────── */
export function Meetings() {
  const { me } = useAuth();
  const q = useGet<any[]>(`/meetings?from=${addDays(today(), -7)}T00:00:00&to=${addDays(today(), 90)}T23:59:59`);
  const [edit, setEdit] = useState<any>(null);
  const rsvp = useAction(([id, r]: [string, string]) => post(`/meetings/${id}/respond`, { response: r }), { ok: 'Response sent', invalidate: ['/meetings', '/home'] });
  const upcoming = (q.data || []).filter((m) => new Date(m.endAt) >= new Date());
  const groups = upcoming.reduce((g: Record<string, any[]>, m) => { const k = new Date(m.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); (g[k] ||= []).push(m); return g; }, {});
  const blank = () => { const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); const e = new Date(s.getTime() + 3600000); const loc = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); return { title: '', description: '', location: '', onlineUrl: '', start: loc(s), end: loc(e), attendeeUserIds: [] }; };
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="row"><span className="grow" /><button className="btn primary" onClick={() => setEdit(blank())}><Icon name="plus" size={16} />Schedule meeting</button></div>
      {!q.data ? <Spinner /> : !upcoming.length ? <div className="card"><Empty title="No upcoming meetings" /></div> : Object.entries(groups).map(([day, list]) => (
        <div className="card" key={day} style={{ margin: 0 }}><h3>{day}</h3>
          {list.map((m) => (
            <div className="list-row" key={m.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 92 }} className="num"><b>{new Date(m.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b><div className="small faint">{new Date(m.endAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></div>
              <div className="grow"><b>{m.title}</b><div className="small muted">{m.location}{m.onlineUrl && <> · <a href={m.onlineUrl} target="_blank" rel="noreferrer">Join online</a></>} · by {m.organizerName}</div>
                <div className="row small" style={{ marginTop: 4 }}>{m.attendees.map((a: any) => <span key={a.userId} className={'badge ' + (a.response === 'ACCEPTED' ? 'ok' : a.response === 'DECLINED' ? 'bad' : '')}>{a.name}</span>)}</div></div>
              <div className="row">
                {m.myResponse && !m.isOrganizer && <>{m.myResponse !== 'ACCEPTED' && <button className="btn sm primary" onClick={() => rsvp.run([m.id, 'ACCEPTED'])}>Accept</button>}{m.myResponse !== 'DECLINED' && <button className="btn sm" onClick={() => rsvp.run([m.id, 'DECLINED'])}>Decline</button>}</>}
                {(m.isOrganizer || isAdmin(me?.role)) && <button className="btn sm" onClick={() => { const loc = (d: string) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }; setEdit({ ...m, start: loc(m.startAt), end: loc(m.endAt), attendeeUserIds: m.attendees.map((a: any) => a.userId) }); }}>Edit</button>}
              </div>
            </div>))}
        </div>))}
      {edit && <MeetingForm m={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MeetingForm({ m, onClose }: { m: any; onClose: () => void }) {
  const { me } = useAuth();
  const people = useGet<any[]>('/meetings/people');
  const [f, setF] = useState<any>({ ...m, location: m.location || '', onlineUrl: m.onlineUrl || '', description: m.description || '' });
  const [find, setFind] = useState('');
  const confirm = useConfirm();
  const save = useAction(() => { const b = { title: f.title, description: f.description, location: f.location, onlineUrl: f.onlineUrl, startAt: new Date(f.start).toISOString(), endAt: new Date(f.end).toISOString(), attendeeUserIds: f.attendeeUserIds }; return m.id ? patch(`/meetings/${m.id}`, b) : post('/meetings', b); },
    { ok: m.id ? 'Meeting updated' : 'Invites sent', invalidate: ['/meetings', '/home'], onDone: onClose });
  const remove = useAction(() => del(`/meetings/${m.id}`), { ok: 'Meeting cancelled', invalidate: ['/meetings', '/home'], onDone: onClose });
  const others = (people.data || []).filter((p) => p.userId !== me?.user.id && p.name.toLowerCase().includes(find.toLowerCase()));
  return (
    <Modal wide title={m.id ? 'Edit meeting' : 'Schedule meeting'} onClose={onClose} footer={<>{m.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: 'Cancel this meeting? Attendees will be notified.', danger: true, ok: 'Cancel meeting' })) && remove.run(undefined)}>Cancel meeting</button>}<button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => save.run(undefined)}>{m.id ? 'Save' : 'Send invites'}</button></>}>
      <div className="grid g2">
        <div className="form" style={{ alignContent: 'start' }}>
          <Field label="Title" full><input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Starts"><input className="inp" type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ends"><input className="inp" type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Location" full><input className="inp" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Online meeting link" full><input className="inp" type="url" value={f.onlineUrl} onChange={(e) => setF({ ...f, onlineUrl: e.target.value })} placeholder="https://" /></Field>
          <Field label="Agenda" full><textarea className="inp" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <div><Field label={`Invite (${f.attendeeUserIds.length})`}><input className="inp" placeholder="Search people…" value={find} onChange={(e) => setFind(e.target.value)} /></Field>
          <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>{others.map((p) => <label key={p.userId} className="list-row"><input type="checkbox" checked={f.attendeeUserIds.includes(p.userId)} onChange={(e) => setF({ ...f, attendeeUserIds: e.target.checked ? [...f.attendeeUserIds, p.userId] : f.attendeeUserIds.filter((x: string) => x !== p.userId) })} /><span className="grow">{p.name}</span><span className="small faint">{p.email}</span></label>)}</div></div>
      </div>
      <p className="small muted">Attendees get a notification now and a reminder 15 minutes before.</p>
    </Modal>
  );
}

/* ───────── Notifications ───────── */
export function Notifications() {
  const q = useGet<any[]>('/notifications');
  const nav = useNavigate();
  const read = useAction((ids?: string[]) => post('/notifications/read', { ids }), { invalidate: ['/notifications'] });
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <div className="tools"><span className="grow" /><button className="btn" onClick={() => read.run(undefined)}>Mark all as read</button></div>
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="You're all caught up" /> : q.data.map((n) => (
        <div key={n.id} className="list-row" style={{ cursor: 'pointer', opacity: n.readAt ? 0.6 : 1 }} onClick={() => { if (!n.readAt) read.run([n.id]); if (n.link) nav(n.link.replace('/me/leave', '/leave').replace('/me/claims', '/claims').replace('/me/services', '/services').replace('/me/timesheets', '/timesheets').replace('/me/performance', '/performance').replace('/me/training', '/training').replace('/me/onboarding', '/onboarding').replace('/me/shifts', '/shifts')); }}>
          {!n.readAt && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--brand)' }} />}
          <div className="grow"><b>{n.title}</b>{n.body && <div className="small muted">{n.body}</div>}</div><span className="small faint">{ago(n.createdAt)}</span>
        </div>))}
    </div>
  );
}
