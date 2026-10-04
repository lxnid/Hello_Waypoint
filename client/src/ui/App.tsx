import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Identity } from '@waypoint/contracts';
import { ROLE_HOME } from '@waypoint/contracts/roles';
import { api, ApiError } from '../api';
import { forgetDriver, loadSession, rememberDriver } from '../offline/session';
import { SessionLoader } from './components/SessionLoader';
import { LoginView } from './login/LoginView';
import { PortalView } from './portal/PortalView';

export function App() {
  const session = useQuery({
    queryKey: ['identity'],
    queryFn: loadSession,
    retry: false,
    networkMode: 'always',
  });

  if (session.isPending) return <SessionLoader />;

  const sessionRejected =
    session.error instanceof ApiError && [401, 403].includes(session.error.status);
  const identity = sessionRejected ? undefined : session.data;
  return (
    <Routes>
      <Route
        path="/login"
        element={identity ? <Navigate to={ROLE_HOME[identity.user.role]} replace /> : <Login />}
      />
      <Route
        path="/"
        element={<Navigate to={identity ? ROLE_HOME[identity.user.role] : '/login'} replace />}
      />
      <Route
        path="/:portal/*"
        element={identity ? <Portal identity={identity} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const identity = await api.login(email.trim(), password);
      await rememberDriver(identity).catch(() => undefined);
      queryClient.setQueryData(['identity'], identity);
      navigate(ROLE_HOME[identity.user.role], { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LoginView
      email={email}
      password={password}
      error={error}
      isSubmitting={isSubmitting}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}

function Portal({ identity }: { identity: Identity }) {
  const { user } = identity;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const overview = useQuery({
    queryKey: ['overview', user.role],
    queryFn: () => api.overview(user.role),
  });

  const roleRoot = ROLE_HOME[user.role].split('/').slice(0, 2).join('/');
  if (location.pathname !== roleRoot && !location.pathname.startsWith(`${roleRoot}/`)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  async function handleLogout() {
    setLogoutError('');
    setIsLoggingOut(true);

    async function finishLogout() {
      await forgetDriver().catch(() => undefined);
      // Update the observed session before navigating so the login route cannot
      // redirect back to the role workspace with stale cached identity data.
      queryClient.setQueryData(['identity'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'identity' });
      navigate('/login', { replace: true });
    }

    try {
      await api.logout();
      await finishLogout();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await finishLogout();
        return;
      }
      setLogoutError('We could not sign you out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <PortalView
      user={user}
      overview={overview.data}
      isOverviewLoading={overview.isPending}
      overviewError={overview.error instanceof Error ? overview.error.message : ''}
      logoutError={logoutError}
      isLoggingOut={isLoggingOut}
      onLogout={handleLogout}
    />
  );
}
