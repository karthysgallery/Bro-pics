import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

function Probe() {
  const { user, loading } = useAuth();
  return <div data-testid="probe">{loading ? 'loading' : user ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider / useAuth', () => {
  it('reports signed-out once the auth listener resolves with no user', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out'));
  });

  it('signOut() calls Firebase Auth signOut', async () => {
    const { signOut: mockedFirebaseSignOut } = await import('firebase/auth');

    function SignOutProbe() {
      const { signOut } = useAuth();
      return <button onClick={() => signOut()}>Sign out</button>;
    }

    render(
      <AuthProvider>
        <SignOutProbe />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('Sign out'));
    await waitFor(() => expect(mockedFirebaseSignOut).toHaveBeenCalled());
  });
});
