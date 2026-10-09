import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import type { MeResponse } from '@/api/types';
import { useLogout } from '@/api/hooks';
import { SessionTimeoutDialog } from '@/auth/SessionTimeoutDialog';
import { OlbHeader } from './OlbHeader';
import { Footer } from './Footer';

export function OlbLayout() {
  const me = useOutletContext<MeResponse>();
  const logout = useLogout();
  const navigate = useNavigate();
  const doLogout = () => logout.mutate(undefined, { onSettled: () => navigate('/', { replace: true }) });
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <OlbHeader firstName={me.firstName} onLogout={doLogout} loggingOut={logout.isPending} />
      <SessionTimeoutDialog timeoutSeconds={me.sessionTimeoutSeconds || 600} onLogout={doLogout} />
      <main id="main" tabIndex={-1}>
        <Outlet context={me} />
      </main>
      <Footer />
    </>
  );
}
