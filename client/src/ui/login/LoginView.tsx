import type { FormEventHandler } from 'react';
import { ArrowRight, Boxes, MapPin, Route, Truck } from 'lucide-react';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';

type LoginViewProps = {
  email: string;
  password: string;
  error: string;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function LoginView({
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginViewProps) {
  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="Waypoint logistics">
        <Brand context="LOGISTICS" inverse />
        <div className="abstract-map" aria-hidden="true">
          <span className="map-block map-block-chilled" />
          <span className="map-block map-block-ambient" />
          <span className="map-block map-block-textile" />
          <span className="map-block map-block-fragile" />
          <svg viewBox="0 0 640 430" role="presentation">
            <path d="M-30 360C90 348 124 248 226 252C342 256 350 106 476 110C550 112 590 60 676 26" />
            <circle cx="225" cy="252" r="13" />
            <circle cx="477" cy="110" r="13" />
          </svg>
          <span className="map-symbol map-symbol-route">
            <Route />
          </span>
          <span className="map-symbol map-symbol-truck">
            <Truck />
          </span>
          <span className="map-symbol map-symbol-boxes">
            <Boxes />
          </span>
          <span className="map-symbol map-symbol-pin">
            <MapPin />
          </span>
        </div>
        <div className="brand-message">
          <p className="caption">ONE CONNECTED WORKFLOW</p>
          <h1 id="brand-heading">Every delivery, clearly on its way.</h1>
          <p>From order planning to store receipt, Waypoint keeps every team moving together.</p>
        </div>
        <p className="brand-footnote">Dispatch · Loading · Delivery · Stores</p>
      </section>

      <section className="login-form-panel" aria-labelledby="login-heading">
        <div className="mobile-brand">
          <Brand context="LOGISTICS" />
        </div>
        <div className="login-card">
          <header className="login-heading">
            <p className="caption">WELCOME TO WAYPOINT</p>
            <h2 id="login-heading">Sign in</h2>
            <p>Use your assigned credentials to access your workspace.</p>
          </header>

          <form onSubmit={onSubmit}>
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              placeholder="name@waypoint.lk"
              autoComplete="username"
              onChange={(event) => onEmailChange(event.target.value)}
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              placeholder="Enter your password"
              autoComplete="current-password"
              onChange={(event) => onPasswordChange(event.target.value)}
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={isSubmitting}
              icon={<ArrowRight size={18} aria-hidden="true" />}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="credential-help">
            Need access? <strong>Contact your Waypoint administrator.</strong>
          </p>
        </div>
        <footer className="login-footer">Secure access for authorised operations teams</footer>
      </section>
    </main>
  );
}
