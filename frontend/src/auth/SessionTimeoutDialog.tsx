import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ACTIVITY_EVENT } from '@/api/client';
import { olbApi, queryKeys } from '@/api/olb';
import { EXPIRED_PATH } from './RequireAuth';

const WARN_BEFORE_MS = 60_000;

/** A13: warn before the 10-minute server inactivity timeout instead of a silent redirect. */
export function SessionTimeoutDialog({ timeoutSeconds, onLogout }: { timeoutSeconds: number; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const lastActivity = useRef(Date.now());
  const stayRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const timeoutMs = timeoutSeconds * 1000;

  useEffect(() => {
    const onActivity = () => {
      lastActivity.current = Date.now();
      setOpen(false);
    };
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    const id = window.setInterval(() => {
      const left = timeoutMs - (Date.now() - lastActivity.current);
      if (left <= 0) {
        window.clearInterval(id);
        qc.clear();
        navigate(EXPIRED_PATH, { replace: true });
      } else if (left <= WARN_BEFORE_MS) {
        setRemaining(Math.ceil(left / 1000));
        setOpen(true);
      }
    }, 1000);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, onActivity);
      window.clearInterval(id);
    };
  }, [timeoutMs, navigate, qc]);

  useEffect(() => {
    if (open) stayRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const stay = () => void qc.fetchQuery({ queryKey: queryKeys.me, queryFn: olbApi.me, staleTime: 0 });
  return (
    <div className="dialog-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="sto-title" aria-describedby="sto-desc" className="dialog">
        <h2 id="sto-title">Are you still there?</h2>
        <p id="sto-desc">
          For your security, Online Banking will sign you out in {remaining} seconds due to inactivity.
        </p>
        <div className="dialog-actions">
          <button ref={stayRef} type="button" className="pill pill-fill" onClick={stay}>Stay signed in</button>
          <button type="button" className="pill pill-line" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  );
}
