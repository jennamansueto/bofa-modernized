import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createQueryClient } from '@/api/queryClient';
import { NotFoundPage } from './ErrorPage';

describe('ErrorPage', () => {
  it('AC-42 renders the branded not-found page with an error reference', () => {
    const router = createMemoryRouter([{ path: '*', element: <NotFoundPage /> }], { initialEntries: ['/does-not-exist'], future: { v7_relativeSplatPath: true } });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We\u2019re sorry, Online Banking is temporarily unavailable.');
    expect(screen.getByText(/Error reference: ERR-[0-9A-F]+ · HTTP 404/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });
});
