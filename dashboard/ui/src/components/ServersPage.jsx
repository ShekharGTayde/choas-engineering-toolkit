import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import AddServerDialog from './AddServerDialog.jsx';
import ServerCard from './ServerCard.jsx';
import styles from './ServersPage.module.css';

export default function ServersPage({ addToast }) {
  const { token, isOperator } = useAuth();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingId, setCheckingId] = useState(null);

  const loadServers = useCallback(async () => {
    try {
      const res = await fetch('/api/servers', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load registered servers');
      const json = await res.json();
      setServers(json.servers || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, addToast]);

  useEffect(() => { loadServers(); }, [loadServers]);

  const handleServerAdded = (server) => {
    setServers((prev) => [...prev, server]);
    addToast(`${server.name} registered — status: ${server.status}`, server.status === 'UP' ? 'success' : 'error');
  };

  const handleCheck = async (id) => {
    setCheckingId(id);
    try {
      const res = await fetch(`/api/servers/${id}/check`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Health check failed');
      const updated = await res.json();
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
      addToast(`${updated.name}: ${updated.status}`, updated.status === 'UP' ? 'success' : 'error');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!isOperator) {
      addToast('Viewer role cannot remove servers. Operator role required.', 'error');
      return;
    }

    const server = servers.find((s) => s.id === id);
    if (!window.confirm(`Are you sure you want to remove "${server?.name}"?`)) return;

    try {
      const res = await fetch(`/api/servers/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to remove server');
      setServers((prev) => prev.filter((s) => s.id !== id));
      addToast(`${server?.name} removed`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const upCount = servers.filter((s) => s.status === 'UP').length;
  const downCount = servers.filter((s) => s.status === 'DOWN').length;

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>External Server Registry</span>
          <h2 className={styles.pageTitle}>Monitored Target Systems</h2>
          <p className={styles.pageDesc}>
            Register external HTTP/HTTPS health endpoints for passive uptime tracking and latency monitoring.
          </p>
        </div>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => setDialogOpen(true)}
          disabled={!isOperator}
          title={!isOperator ? 'Viewer role is read-only. Operator role required to add servers.' : 'Register new external server'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Server</span>
        </button>
      </div>

      {/* Summary stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statDot} data-status="total" />
          <strong>{servers.length}</strong>
          <span>Total Registered</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statDot} data-status="up" />
          <strong style={{ color: 'var(--status-healthy)' }}>{upCount}</strong>
          <span>Healthy & Operational</span>
        </div>
        {downCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statDot} data-status="down" />
            <strong style={{ color: 'var(--status-critical)' }}>{downCount}</strong>
            <span>Degraded / Down</span>
          </div>
        )}
      </div>

      {/* Grid or loading / empty state */}
      {loading ? (
        <div className={styles.empty}>
          <div className={styles.spinner} />
          <p>Querying server registry…</p>
        </div>
      ) : servers.length === 0 ? (
        <div className={styles.empty}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          <h3 className={styles.emptyTitle}>No external servers registered yet</h3>
          <p className={styles.emptyDesc}>
            Register an external service URL to monitor its latency and availability. External endpoints are protected and monitor-only.
          </p>
          {isOperator && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setDialogOpen(true)}
            >
              Add Your First Server
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              checking={checkingId === server.id}
              onCheck={handleCheck}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddServerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={handleServerAdded}
        addToast={addToast}
      />
    </div>
  );
}
