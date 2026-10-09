import { useMemo } from 'react';
import { Link, isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { useLogout } from '@/api/hooks';
import { queryKeys } from '@/api/olb';
import type { MeResponse } from '@/api/types';
import { Footer } from '@/components/layout/Footer';
import { OlbHeader } from '@/components/layout/OlbHeader';
import { MSG, TITLES } from '@/lib/messages';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

/** Legacy error.jsp (P8 / AC-42): branded page for 404s and unexpected errors. */
export function ErrorPage({ status }: { status?: number }) {
  useDocumentTitle(TITLES.error);
  const routeError = useRouteError() as unknown;
  const qc = useQueryClient();
  const me = qc.getQueryData<MeResponse>(queryKeys.me);
  const logout = useLogout();
  const navigate = useNavigate();
  const doLogout = () => logout.mutate(undefined, { onSettled: () => navigate('/', { replace: true }) });

  const httpStatus = status ?? (isRouteErrorResponse(routeError) ? routeError.status : routeError instanceof ApiError ? routeError.status : 500);
  const serverRef = routeError instanceof ApiError ? /Error reference: (ERR-[0-9A-Fa-f]+)/.exec(routeError.message)?.[1] : undefined;
  const ref = useMemo(() => serverRef?.toUpperCase().replace('ERR-', 'ERR-') ?? `ERR-${Date.now().toString(16).toUpperCase()}`, [serverRef]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <OlbHeader firstName={me?.firstName} onLogout={doLogout} loggingOut={logout.isPending} />
      <main id="main" tabIndex={-1} className="inner error-page">
        <h1 className="section-h">{MSG.errorHeading}</h1>
        <p className="lead">{MSG.errorLead}</p>
        <p className="err-ref">Error reference: {ref} · HTTP {httpStatus}</p>
        <Link to="/" className="btn-secondary">Return to sign in</Link>
      </main>
      <Footer />
    </>
  );
}

export function NotFoundPage() {
  return <ErrorPage status={404} />;
}
