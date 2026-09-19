import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './LoginPage.module.css';

export default function LoginPage({ onNavigateToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brandRow}>
            <div className={styles.logoMark}>
              <span className={styles.pulseDot}></span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandName}>ChaosGuard</span>
              <span className={styles.brandBadge}>Console</span>
            </div>
          </div>
          <h1 className={styles.title}>Sign in to console</h1>
          <p className={styles.subtitle}>
            Authenticate with your Operator or Viewer credentials to access cluster experiments.
          </p>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={styles.input}
              placeholder="operator@chaosguard.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password" className={styles.label}>Password</label>
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className={styles.input}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner}></span>
                <span>Verifying credentials...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>

        <div className={styles.demoSection}>
          <span className={styles.demoTitle}>Quick Demo Access</span>
          <div className={styles.demoButtons}>
            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => fillDemoAccount('operator@chaosguard.io', 'Operator123!')}
            >
              <span className={styles.demoRole}>Operator</span>
              <span className={styles.demoDesc}>Full fault execution & testing</span>
            </button>
            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => fillDemoAccount('viewer@chaosguard.io', 'Viewer123!')}
            >
              <span className={styles.demoRole}>Viewer</span>
              <span className={styles.demoDesc}>Read-only metrics & AI reports</span>
            </button>
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerText}>Need a new workspace account?</span>
          <button
            type="button"
            className={styles.switchBtn}
            onClick={onNavigateToRegister}
          >
            Register account
          </button>
        </div>
      </div>
    </div>
  );
}
