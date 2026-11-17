import { useEffect, useRef, useState } from 'react';
import { api, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { Modal } from './ui';

/** Clock in/out with GPS (when the browser allows) and an optional selfie. */
export async function clockWithLocation(action: 'in' | 'out', photo?: string) {
  const pos = await new Promise<GeolocationPosition | null>((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
  return post('/me/attendance/clock', { action, ...(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : {}), ...(photo ? { photo } : {}) });
}

/** Front-camera capture → 480px-wide JPEG data URL. Needs HTTPS (or localhost). */
export function SelfieCamera({ title, onCapture, onClose, busy }: { title: string; onCapture: (dataUrl: string) => void; onClose: () => void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) { setErr('This browser cannot open the camera. Use the PayLora mobile app or an HTTPS address.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => undefined); } })
      .catch(() => setErr('Camera permission was denied. Allow camera access in your browser settings and try again.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = cv.getContext('2d')!;
    ctx.translate(w, 0); ctx.scale(-1, 1); // mirror, like the preview
    ctx.drawImage(v, 0, 0, w, h);
    setShot(cv.toDataURL('image/jpeg', 0.75));
  };
  return (
    <Modal title={title} onClose={onClose} footer={shot
      ? <><button className="btn" onClick={() => setShot(null)}>Retake</button><button className="btn primary" disabled={busy} onClick={() => onCapture(shot)}>{busy ? 'Saving…' : 'Use this photo'}</button></>
      : <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!!err} onClick={snap}>Take selfie</button></>}>
      {err ? <div className="banner bad">{err}</div> : (
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '3 / 4', maxHeight: '60vh', margin: '0 auto' }}>
          {shot ? <img src={shot} alt="Selfie preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
          {!shot && <div style={{ position: 'absolute', inset: '12% 18%', border: '3px dashed rgba(255,255,255,.7)', borderRadius: '50%' }} />}
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>Your photo is attached to today's attendance record and is visible only to you, your manager and HR.</p>
    </Modal>
  );
}

/** Clock in/out button that asks for a selfie when the company requires one. */
export function ClockButton({ action, className = 'btn' }: { action: 'in' | 'out'; className?: string }) {
  const { me } = useAuth();
  const [cam, setCam] = useState(false);
  const run = useAction((photo?: string) => clockWithLocation(action, photo), { ok: action === 'in' ? 'Clocked in' : 'Clocked out', invalidate: ['/home', '/me/attendance', '/attendance'], onDone: () => setCam(false) });
  const label = action === 'in' ? 'Clock in' : 'Clock out';
  return <>
    <button className={className} disabled={run.busy} onClick={() => (me?.company?.requireSelfie ? setCam(true) : run.run(undefined))}>{run.busy ? 'Saving…' : label}</button>
    {cam && <SelfieCamera title={`${label} — take a selfie`} busy={run.busy} onClose={() => setCam(false)} onCapture={(p) => run.run(p)} />}
  </>;
}

/** <img> for protected API images (selfies): fetched with the bearer token. */
export function AuthImage({ path, alt, style, onClick }: { path: string; alt: string; style?: React.CSSProperties; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null, live = true;
    api<Response>(path, { raw: true }).then((r) => r.blob()).then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => undefined);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  return src ? <img src={src} alt={alt} style={style} onClick={onClick} /> : <span style={{ ...style, display: 'inline-block', background: '#eee' }} />;
}

/** Small selfie thumbnails (in/out) that open a larger viewer. */
export function SelfieThumbs({ inId, outId, name }: { inId?: string | null; outId?: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  if (!inId && !outId) return null;
  const thumb = { width: 30, height: 30, borderRadius: 8, objectFit: 'cover' as const, cursor: 'pointer', border: '1px solid var(--line)' };
  return <>
    <span className="row" style={{ gap: 4, display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}>
      {inId && <AuthImage path={`/attendance/photos/${inId}`} alt="Clock-in selfie" style={thumb} onClick={() => setOpen(true)} />}
      {outId && <AuthImage path={`/attendance/photos/${outId}`} alt="Clock-out selfie" style={thumb} onClick={() => setOpen(true)} />}
    </span>
    {open && <Modal title={`${name} — attendance selfies`} onClose={() => setOpen(false)} footer={<button className="btn" onClick={() => setOpen(false)}>Close</button>}>
      <div className="grid g2">
        {[['Clock in', inId], ['Clock out', outId]].map(([l, id]) => <div key={l as string}><b className="small">{l}</b>{id ? <AuthImage path={`/attendance/photos/${id}`} alt={l as string} style={{ width: '100%', borderRadius: 12, marginTop: 6 }} /> : <div className="muted small">No photo</div>}</div>)}
      </div>
    </Modal>}
  </>;
}
