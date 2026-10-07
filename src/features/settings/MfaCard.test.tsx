import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { MfaCard } from './MfaCard.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';

function renderCard(service: FakeAuthService) {
  return render(
    <AuthProvider service={service}>
      <MfaCard />
    </AuthProvider>,
  );
}

describe('MfaCard', () => {
  it('enrolls 2FA: shows the QR code and secret, rejects a wrong code, accepts the right one', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    renderCard(service);

    fireEvent.click(await screen.findByRole('button', { name: 'הפעלת אימות דו-שלבי' }));
    expect(await screen.findByAltText('קוד QR לאפליקציית האימות')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('קוד אימות'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'אישור והפעלה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד שגוי');

    fireEvent.change(screen.getByLabelText('קוד אימות'), {
      target: { value: FakeAuthService.VALID_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'אישור והפעלה' }));
    expect(await screen.findByText('אימות דו-שלבי פעיל')).toBeInTheDocument();
    expect(service.mfaEnrolled).toBe(true);
  });

  it('disables 2FA when it is on', async () => {
    const service = new FakeAuthService({
      signedInAs: 'a@b.co',
      mfaEnrolled: true,
      mfaPassed: true,
    });
    renderCard(service);
    fireEvent.click(await screen.findByRole('button', { name: 'כיבוי אימות דו-שלבי' }));
    expect(await screen.findByRole('button', { name: 'הפעלת אימות דו-שלבי' })).toBeInTheDocument();
    expect(service.mfaEnrolled).toBe(false);
  });
});
