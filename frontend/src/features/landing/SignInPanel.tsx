import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, savedUserId } from '@/api/client';
import { useLogin } from '@/api/hooks';
import { AlertBox } from '@/components/ui/AlertBox';
import { MSG } from '@/lib/messages';
import { clearDraftStorage } from '@/features/transfer/draft';

export function SignInPanel({ expired }: { expired: boolean }) {
  const [userId, setUserId] = useState(savedUserId);
  const [password, setPassword] = useState('');
  const [saveUserId, setSaveUserId] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const login = useLogin();
  const navigate = useNavigate();
  const uid = useId();
  const errId = `${uid}-err`;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    setAttempted(true);
    login.mutate(
      { userId, password, saveUserId },
      {
        onSuccess: () => {
          clearDraftStorage();
          navigate('/transfers', { replace: true });
        },
        onError: (err) => {
          setPassword('');
          setError(err instanceof ApiError ? err.message : MSG.errorHeading);
          requestAnimationFrame(() => alertRef.current?.focus());
        },
      },
    );
  };

  return (
    <section className="loginbox" aria-labelledby={`${uid}-h`}>
      <div className="redtab" aria-hidden="true" />
      <div className="pad">
        <h1 id={`${uid}-h`} className="visually-hidden">Sign in to Online Banking</h1>
        {expired && !attempted && <AlertBox messages={[MSG.sessionExpired]} list={false} />}
        <AlertBox ref={alertRef} id={errId} messages={error ? [error] : []} />
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="userId">User ID</label>
          <input id="userId" name="userId" className="txt" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={userId} onChange={(e) => setUserId(e.target.value)}
            aria-invalid={!!error || undefined} aria-describedby={error ? errId : undefined} />
          <label htmlFor="password">Password</label>
          <div className="pw-wrap">
            <input id="password" name="password" className="txt" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error || undefined} aria-describedby={error ? errId : undefined} />
            <button type="button" className="pw-toggle" aria-controls="password" aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="chk">
            <input id="saveUserId" name="saveUserId" type="checkbox" checked={saveUserId} onChange={(e) => setSaveUserId(e.target.checked)} />
            <label htmlFor="saveUserId">Save user ID</label>
          </div>
          <button type="submit" className="btn-primary" aria-busy={login.isPending || undefined}>Log in</button>
        </form>
        <div className="links">
          <span className="nav-item">Forgot user ID/password</span>
          <br />
          <span className="nav-item">Security &amp; Help</span>
          <span className="links-gap" aria-hidden="true" />
          <span className="nav-item">Enroll</span>
        </div>
      </div>
    </section>
  );
}
