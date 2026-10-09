import { useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, UNAUTHORIZED_EVENT } from '@/api/client';
import { useMe } from '@/api/hooks';

export const EXPIRED_PATH = '/?expired=1';

/** Mirrors the legacy AuthFilter: any unauthenticated /secure call → landing with the "expired" banner (AC-07). */
export function RequireAuth() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const onUnauthorized = () => {
      qc.clear();
      navigate(EXPIRED_PATH, { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate, qc]);

  if (me.isPending) return <div className="page-loading" aria-busy="true" />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.isUnauthorized) return <Navigate to={EXPIRED_PATH} replace />;
    throw me.error;
  }
  return <Outlet context={me.data} />;
}
