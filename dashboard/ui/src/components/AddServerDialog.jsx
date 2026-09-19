import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './AddServerDialog.module.css';

const ENVIRONMENTS = ['Development', 'Staging', 'Production'];
const INITIAL = { name: '', environment: 'Development', healthUrl: '' };

export default function AddServerDialog({ open, onClose, onAdded, addToast }) {
  const { token, isOperator } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) { el.showModal(); }
    if (!open && el.open) { el.close(); }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => { if (!saving && !verifying) handleClose(); };
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, [saving, verifying]);

  const handleClose = () => {
    setForm(INITIAL);
    setVerifyResult(null);
    setUrlError('');
    onClose();
  };

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (key === 'healthUrl') { setVerifyResult(null); setUrlError(''); }
  };

  const handleVerify = async () => {
    const url = form.healthUrl.trim();
    if (!url) { setUrlError('Health URL is required.'); return; }
    if (!/^https?:\/\/.+/.test(url)) { setUrlError('URL must start with http:// or https://'); return; }

    setVerifying(true);
    setVerifyResult(null);
    setUrlError('');

    try {
      const res = await fetch('/api/servers/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ healthUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setUrlError(json.error || 'Verification failed.');
      } else {
        setVerifyResult(json);
      }
    } catch (err) {
      setUrlError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isOperator) {
      addToast('Viewer role cannot add servers. Operator role required.', 'error');
      return;
    }

    if (!form.name.trim()) return;
    if (!verifyResult) {
      setUrlError('Please verify the endpoint before registering.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: form.name.trim(),
          environment: form.environment,
          healthUrl: form.healthUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.error || 'Failed to register server.', 'error');
      } else {
        onAdded(json);
        handleClose();
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.name.trim() && verifyResult && !saving && !verifying && isOperator;

  return (
    <dialog ref={dialogRef} className={styles.dialog}>
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
        </div>
        <div>
          <span className={styles.eyebrow}>Monitored Endpoints</span>
          <h2 className={styles.title}>Register External Server</h2>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className={styles.body}>
          {/* Server name */}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="srv-name">
              Server Name <span className={styles.required}>*</span>
            </label>
            <input
              id="srv-name"
              className={styles.input}
              type="text"
              placeholder="e.g. Payment Gateway (Staging)"
              maxLength={80}
              value={form.name}
              onChange={set('name')}
              required
            />
          </div>

          {/* Environment */}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="srv-env">Environment</label>
            <select
              id="srv-env"
              className={styles.select}
              value={form.environment}
              onChange={set('environment')}
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>

          {/* Health URL + Verify button */}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="srv-url">
              Health Probe URL <span className={styles.required}>*</span>
            </label>
            <div className={styles.urlRow}>
              <input
                id="srv-url"
                className={`${styles.input} ${urlError ? styles.inputError : ''}`}
                type="url"
                placeholder="https://api.example.com/health"
                maxLength={512}
                value={form.healthUrl}
                onChange={set('healthUrl')}
                required
              />
              <button
                type="button"
                className={styles.btnVerify}
                onClick={handleVerify}
                disabled={verifying || !form.healthUrl.trim()}
              >
                {verifying ? <span className={styles.miniSpinner} /> : 'Verify'}
              </button>
            </div>

            {urlError && (
              <p className={styles.fieldError}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {urlError}
              </p>
            )}

            {/* Probe result badge */}
            {verifyResult && (
              <div className={`${styles.verifyResult} ${verifyResult.ok ? styles.verifyOk : styles.verifyFail}`}>
                <div className={styles.verifyIcon}>
                  {verifyResult.ok ? '✓' : '✕'}
                </div>
                <div className={styles.verifyBody}>
                  <strong>{verifyResult.ok ? 'Endpoint verified reachable' : 'Probe failed / unreachable'}</strong>
                  <span>
                    Status: {verifyResult.httpStatus ?? 'ERR'} · Response: {verifyResult.latencyMs} ms
                  </span>
                  {verifyResult.error && (
                    <span className={styles.verifyError}>{verifyResult.error}</span>
                  )}
                </div>
              </div>
            )}

            <p className={styles.hint}>
              SSRF Protected: Private IPs, loopbacks (localhost), and cloud metadata endpoints are strictly blocked. External servers are monitor-only.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={!canSave}
            title={!isOperator ? 'Operator role required to register servers' : undefined}
          >
            {saving ? 'Registering…' : 'Register Server'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
