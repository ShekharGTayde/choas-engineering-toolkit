import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './RegisterPage.module.css';

export default function RegisterPage({ onNavigateToLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('Operator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, role);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brandRow}>
            <div className={styles.logoMark}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandName}>ChaosGuard</span>
              <span className={styles.brandBadge}>Account</span>
            </div>
          </div>
          <h1 className={styles.title}>Create console account</h1>
          <p className={styles.subtitle}>
            Register a new authorized account to interact with the chaos engineering toolkit.
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
            <label htmlFor="name" className={styles.label}>Full Name</label>
            <input
              id="name"
              type="text"
              required
              className={styles.input}
              placeholder="Alex Chen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              required
              className={styles.input}
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>Password</label>
              <input
                id="password"
                type="password"
                required
                className={styles.input}
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirm</label>
              <input
                id="confirmPassword"
                type="password"
                required
                className={styles.input}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Account Role</label>
            <div className={styles.roleSelection}>
              <label className={`${styles.roleOption} ${role === 'Operator' ? styles.roleSelected : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="Operator"
                  checked={role === 'Operator'}
                  onChange={() => setRole('Operator')}
                  className={styles.roleRadio}
                />
                <div className={styles.roleContent}>
                  <strong className={styles.roleTitle}>Operator</strong>
                  <span className={styles.roleDesc}>Execute chaos experiments, load tests, and configure servers</span>
                </div>
              </label>

              <label className={`${styles.roleOption} ${role === 'Viewer' ? styles.roleSelected : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="Viewer"
                  checked={role === 'Viewer'}
                  onChange={() => setRole('Viewer')}
                  className={styles.roleRadio}
                />
                <div className={styles.roleContent}>
                  <strong className={styles.roleTitle}>Viewer</strong>
                  <span className={styles.roleDesc}>Read-only access to metrics, anomaly graphs, and AI analysis</span>
                </div>
              </label>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner}></span>
                <span>Creating account...</span>
              </>
            ) : (
              <span>Create account</span>
            )}
          </button>
        </form>

        <div className={styles.footer}>
          <span className={styles.footerText}>Already have an account?</span>
          <button
            type="button"
            className={styles.switchBtn}
            onClick={onNavigateToLogin}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
