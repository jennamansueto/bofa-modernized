import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { createQueryClient } from '@/api/queryClient';
import { RequireAuth } from '@/auth/RequireAuth';
import { OlbLayout } from '@/components/layout/OlbLayout';
import { ConfirmationPage } from '@/pages/ConfirmationPage';
import { ErrorPage, NotFoundPage } from '@/pages/ErrorPage';
import { LandingPage } from '@/pages/LandingPage';
import { TransferPage } from '@/pages/TransferPage';

const queryClient = createQueryClient();

const router = createBrowserRouter([
  { path: '/', element: <LandingPage />, errorElement: <ErrorPage /> },
  { path: '/index.jsp', element: <Navigate to="/" replace /> },
  {
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <OlbLayout />,
        children: [
          { path: '/transfers', element: <TransferPage /> },
          { path: '/transfers/confirmation/:conf', element: <ConfirmationPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
], { future: { v7_relativeSplatPath: true } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  );
}
