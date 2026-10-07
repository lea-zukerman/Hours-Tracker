import { useAuth } from '../../auth/AuthContext.tsx';
import { Button } from '../../ui/Button.tsx';

/** Header: who is signed in + sign-out. */
export function AccountMenu() {
  const { state, service } = useAuth();
  if (state.status !== 'signed_in') return null;
  return (
    <div className="account-menu">
      <span dir="ltr" className="account-menu__email">
        {state.session.email}
      </span>
      <Button variant="ghost" onClick={() => void service.signOut()}>
        התנתקות
      </Button>
    </div>
  );
}
