import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { post } from '../lib/api';
import { titleCase } from '../lib/format';
import { useGet } from '../lib/hooks';
import { Field, Modal, Spinner } from '../components/ui';

/** Public careers page (Job Board) — no login needed: /careers/:slug */
export function Careers() {
  const { slug = '' } = useParams();
  const q = useGet<{ company: { name: string }; jobs: any[] }>(`/public/careers/${slug}`);
  const [job, setJob] = useState<any>(null);
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px' }}>
      {q.isLoading ? <Spinner /> : q.error ? <div className="card"><div className="empty"><b>Careers page not found</b></div></div> : (
        <>
          <div className="card" style={{ background: 'linear-gradient(140deg,#10251f,#0d6b5c)', color: '#fff' }}>
            <div className="small" style={{ color: '#a9d3c7', fontWeight: 700, letterSpacing: '.08em' }}>CAREERS</div>
            <h1 style={{ fontSize: 30, marginTop: 6 }}>Work with {q.data!.company.name}</h1>
            <p style={{ color: '#cfe7e0', margin: '6px 0 0' }}>{q.data!.jobs.length} open position{q.data!.jobs.length === 1 ? '' : 's'}</p>
          </div>
          {sent && <div className="banner info" style={{ marginTop: 16 }}>Thanks! Your application for <b>{sent}</b> was sent.</div>}
          {q.data!.jobs.map((j) => (
            <div className="card" key={j.id}>
              <div className="row between"><div><h3 style={{ margin: 0 }}>{j.title}</h3>
                <div className="muted small">{[j.department, j.location, titleCase(j.type), j.salaryRange].filter(Boolean).join(' · ')}</div></div>
                <button className="btn primary" onClick={() => setJob(j)}>Apply</button></div>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{j.description}</p>
            </div>
          ))}
          {!q.data!.jobs.length && <div className="card"><div className="empty"><b>No open positions right now</b>Check back soon.</div></div>}
        </>
      )}
      {job && <ApplyForm slug={slug} job={job} onClose={() => setJob(null)} onSent={() => { setSent(job.title); setJob(null); }} />}
    </div>
  );
}

function ApplyForm({ slug, job, onClose, onSent }: { slug: string; job: any; onClose: () => void; onSent: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', resumeUrl: '', coverLetter: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await post(`/public/careers/${slug}/jobs/${job.id}/apply`, f); onSent(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Apply: ${job.title}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {err && <div className="banner bad full">{err}</div>}
        <Field label="Full name"><input className="inp" {...bind('name')} required /></Field>
        <Field label="Email"><input className="inp" type="email" {...bind('email')} required /></Field>
        <Field label="Phone"><input className="inp" {...bind('phone')} /></Field>
        <Field label="Résumé link (Drive, LinkedIn…)"><input className="inp" type="url" {...bind('resumeUrl')} placeholder="https://" /></Field>
        <Field label="Cover letter" full><textarea className="inp" rows={5} {...bind('coverLetter')} /></Field>
        <div className="mfoot full"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button></div>
      </form>
    </Modal>
  );
}
