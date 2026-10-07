import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { AuthGate } from './AuthGate.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';

const PASSWORD = 'Ab1!xyzwvu';

function renderGate(service: FakeAuthService) {
  return render(
    <AuthProvider service={service}>
      <AuthGate>
        <AccountMenu />
        <p>תוכן האפליקציה</p>
      </AuthGate>
    </AuthProvider>,
  );
}

function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: password } });
}

describe('AuthGate', () => {
  it('shows the login screen when signed out', async () => {
    renderGate(new FakeAuthService());
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();
  });

  it('shows the app after a successful sign-in, with the email and a sign-out button', async () => {
    renderGate(new FakeAuthService({ users: { 'a@b.co': PASSWORD } }));
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
    expect(screen.getByText('a@b.co')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
  });

  it('shows a generic message for wrong credentials', async () => {
    renderGate(new FakeAuthService({ users: { 'a@b.co': PASSWORD } }));
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', 'Wrong1!pass');
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אימייל או סיסמה שגויים');
  });

  it('disables submit while signing in', async () => {
    const service = new FakeAuthService({ users: { 'a@b.co': PASSWORD } });
    let release!: () => void;
    service.signInGate = new Promise((r) => (release = r));
    renderGate(service);
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', PASSWORD);
    const submit = screen.getByRole('button', { name: 'התחברות' });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    release();
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
  });

  it('requires consent and a strong password to sign up, and sends consent', async () => {
    const service = new FakeAuthService();
    renderGate(service);
    fireEvent.click(await screen.findByRole('button', { name: 'אין לך חשבון? להרשמה' }));
    const submit = screen.getByRole('button', { name: 'יצירת חשבון' });

    fillCredentials('new@b.co', PASSWORD);
    expect(submit).toBeDisabled(); // no consent yet
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).toBeEnabled();

    fillCredentials('new@b.co', 'short');
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('הסיסמה חלשה מדי');
    expect(service.lastSignUp).toBeNull();

    fillCredentials('new@b.co', PASSWORD);
    fireEvent.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent('נשלח אליך מייל');
    expect(service.lastSignUp).toEqual({
      email: 'new@b.co',
      password: PASSWORD,
      privacyConsent: true,
    });
  });

  it('asks for the 2FA code when the session is only aal1', async () => {
    renderGate(new FakeAuthService({ signedInAs: 'a@b.co', mfaEnrolled: true }));
    expect(await screen.findByRole('heading', { name: 'אימות דו-שלבי' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('קוד מאפליקציית האימות'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד שגוי');

    fireEvent.change(screen.getByLabelText('קוד מאפליקציית האימות'), {
      target: { value: FakeAuthService.VALID_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
  });

  it('returns to login when the session ends', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    renderGate(service);
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
    service.expireSession();
    await waitFor(() => expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
  });
});
