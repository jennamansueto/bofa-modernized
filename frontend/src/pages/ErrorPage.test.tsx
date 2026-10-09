import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ME, mockFetch } from '@/test/utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createQueryClient } from '@/api/queryClient';
import { NotFoundPage } from './ErrorPage';

function renderNotFound() {
  const router = createMemoryRouter([{ path: '*', element: <NotFoundPage /> }], { initialEntries: ['/does-not-exist'], future: { v7_relativeSplatPath: true } });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>,
  );
}

describe('ErrorPage', () => {
  it('shows the signed-in header with Log out when the session is still valid', async () => {
    mockFetch({ 'GET /api/secure/me': () => ({ status: 200, body: ME }) });
    renderNotFound();
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('AC-42 renders the branded not-found page with an error reference', async () => {
    mockFetch({ 'GET /api/secure/me': () => ({ status: 401, body: { ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } }) });
    const router = createMemoryRouter([{ path: '*', element: <NotFoundPage /> }], { initialEntries: ['/does-not-exist'], future: { v7_relativeSplatPath: true } });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We\u2019re sorry, Online Banking is temporarily unavailable.');
    expect(screen.getByText(/Error reference: ERR-[0-9A-F]+ · HTTP 404/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/');
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });
});
