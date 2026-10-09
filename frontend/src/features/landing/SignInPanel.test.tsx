import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockFetch, renderWithProviders, ME } from '@/test/utils';
import { SignInPanel } from './SignInPanel';

const INVALID = 'The User ID or Password you entered does not match our records. Please try again.';
const LOCKED = 'Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000.';
const EXPIRED = 'For your security, your session has ended due to inactivity. Please log in again.';

describe('SignInPanel', () => {
  it('AC-01 renders labelled, autocomplete-enabled fields and signs in', async () => {
    const fetch = mockFetch({ 'POST /api/login': () => ({ status: 200, body: ME }) });
    renderWithProviders(<SignInPanel expired={false} />);
    expect(screen.getByLabelText('User ID')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    await userEvent.type(screen.getByLabelText('User ID'), 'demo.user');
    await userEvent.type(screen.getByLabelText('Password'), 'Password1');
    await userEvent.click(screen.getByLabelText('Save user ID'));
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('transfers page')).toBeInTheDocument();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ userId: 'demo.user', password: 'Password1', saveUserId: true });
  });

  it('AC-03 shows the server invalid message verbatim, focuses it and marks fields invalid', async () => {
    mockFetch({ 'POST /api/login': () => ({ status: 401, body: { ok: false, status: 401, code: 'LOGIN_INVALID', message: INVALID } }) });
    renderWithProviders(<SignInPanel expired={false} />);
    await userEvent.type(screen.getByLabelText('User ID'), 'demo.user');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('AC-04 shows the lockout message', async () => {
    mockFetch({ 'POST /api/login': () => ({ status: 401, body: { ok: false, status: 401, code: 'LOGIN_LOCKED', message: LOCKED } }) });
    renderWithProviders(<SignInPanel expired={false} />);
    await userEvent.type(screen.getByLabelText('User ID'), 'sam.chen');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LOCKED);
  });

  it('AC-07 shows the session-expired banner when redirected from a 401', () => {
    renderWithProviders(<SignInPanel expired />);
    expect(screen.getByRole('alert')).toHaveTextContent(EXPIRED);
  });

  it('AC-06 prefills the saved user id from the olb_uid cookie and toggles password visibility', async () => {
    document.cookie = 'olb_uid=demo.user; path=/';
    renderWithProviders(<SignInPanel expired={false} />);
    expect(screen.getByLabelText('User ID')).toHaveValue('demo.user');
    expect(screen.getByLabelText('Save user ID')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
});
