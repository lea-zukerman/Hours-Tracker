import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext.tsx';
import { AppRoutes } from './AppRoutes.tsx';
import { FakeAuthService } from '../test/fakeAuth.ts';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider service={new FakeAuthService()}>
        <AppRoutes app={<p>תוכן האפליקציה</p>} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it.each([
    ['/privacy', 'מדיניות פרטיות'],
    ['/terms', 'תקנון ותנאי שימוש'],
    ['/accessibility', 'הצהרת נגישות'],
  ])('shows %s without signing in', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'התחברות' })).not.toBeInTheDocument();
  });

  it('keeps every other page behind login', async () => {
    renderAt('/reports');
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();
  });
});
