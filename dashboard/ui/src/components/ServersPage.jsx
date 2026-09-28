import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('ALL'); // 'ALL' | 'Production' | 'Staging' | 'Development'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'UP' | 'DOWN'

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

  const filteredServers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((s) => {
      const matchesSearch = !q ||
        s.name.toLowerCase().includes(q) ||
        s.healthUrl.toLowerCase().includes(q) ||
        s.environment.toLowerCase().includes(q);
      const matchesEnv = envFilter === 'ALL' || s.environment === envFilter;
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesEnv && matchesStatus;
    });
  }, [servers, search, envFilter, statusFilter]);

  return (
    <div className={styles.page}>
      {/* ── Section Header Band (Blueprint Editorial Header) ─────────────── */}
      <section className={styles.headerBand}>
        <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.tr}`}>+</span>

        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.markerNumber}>02</div>
            <div className={styles.headerMeta}>
              <div className={styles.moduleTag}>[MODULE // TARGET-SERVERS-REGISTRY]</div>
              <h1 className={styles.pageTitle}>MONITORED TARGET SYSTEMS &amp; SERVERS</h1>
              <p className={styles.pageDesc}>
                Passive uptime observation, latency telemetry, and SSRF-hardened endpoint verification for cluster nodes and external dependencies.
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.pillBtnOrange}
            onClick={() => setDialogOpen(true)}
            disabled={!isOperator}
            title={!isOperator ? 'Viewer role is read-only. Operator role required to add servers.' : 'Register new external server'}
          >
            <span>+ REGISTER TARGET NODE</span>
            <span className={styles.arrowIcon}>↗</span>
          </button>
        </div>
      </section>

      {/* ── Summary Stats Cards in Frosted Glass ─────────────────────────── */}
      <section className={styles.statsGrid} aria-label="Target server summary telemetry">
        <article className={styles.statCard}>
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <div className={styles.statHeader}>
            <span className={styles.statModuleTag}>SYS.COUNT // NODES</span>
            <span className={`${styles.statDot} ${styles.dotTotal}`} />
          </div>
          <div className={styles.statValue}>{servers.length}</div>
          <div className={styles.statLabel}>TOTAL REGISTERED</div>
          <div className={styles.statCaption}>CONFIGURED HEALTH PROBES</div>
        </article>

        <article className={styles.statCard}>
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <div className={styles.statHeader}>
            <span className={styles.statModuleTag}>STATUS.OK // ONLINE</span>
            <span className={`${styles.statDot} ${styles.dotUp}`} />
          </div>
          <div className={styles.statValue} style={{ color: 'var(--status-healthy)' }}>{upCount}</div>
          <div className={styles.statLabel}>HEALTHY &amp; OPERATIONAL</div>
          <div className={styles.statCaption}>PASSING 200 OK AUDITS</div>
        </article>

        <article className={styles.statCard}>
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <div className={styles.statHeader}>
            <span className={styles.statModuleTag}>STATUS.ALERT // DOWN</span>
            <span className={`${styles.statDot} ${styles.dotDown}`} />
          </div>
          <div className={styles.statValue} style={{ color: downCount > 0 ? 'var(--status-critical)' : 'var(--ink-muted)' }}>
            {downCount}
          </div>
          <div className={styles.statLabel}>DEGRADED / DOWN</div>
          <div className={styles.statCaption}>BLOCKED OR TIMEOUT NODES</div>
        </article>

        <article className={styles.statCard}>
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <div className={styles.statHeader}>
            <span className={styles.statModuleTag}>FIREWALL // SSRF-SHIELD</span>
            <span className={`${styles.statDot} ${styles.dotShield}`} />
          </div>
          <div className={styles.statValue} style={{ fontSize: '2rem', color: 'var(--blue-primary)' }}>ENFORCED</div>
          <div className={styles.statLabel}>SECURITY POSTURE</div>
          <div className={styles.statCaption}>PRIVATE &amp; LOOPBACK FILTERED</div>
        </article>
      </section>

      {/* ── Filter & Search Control Bar ─────────────────────────────────── */}
      <section className={styles.controlBar} aria-label="Search and filter targets">
        <div className={styles.searchBox}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH TARGET, URL, ENV…"
            aria-label="Search servers"
            className={styles.searchInput}
          />
          {search && (
            <button className={styles.clearSearchBtn} onClick={() => setSearch('')} aria-label="Clear search">×</button>
          )}
        </div>

        <div className={styles.filterPills}>
          <span className={styles.filterLabel}>ENV:</span>
          {['ALL', 'Production', 'Staging', 'Development'].map((env) => (
            <button
              key={env}
              type="button"
              className={`${styles.pill} ${envFilter === env ? styles.pillActive : ''}`}
              onClick={() => setEnvFilter(env)}
            >
              {env.toUpperCase()}
            </button>
          ))}
        </div>

        <div className={styles.filterPills}>
          <span className={styles.filterLabel}>STATUS:</span>
          {['ALL', 'UP', 'DOWN'].map((st) => (
            <button
              key={st}
              type="button"
              className={`${styles.pill} ${statusFilter === st ? styles.pillActive : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      {/* ── Server Grid or Loading / Empty States ───────────────────────── */}
      {loading ? (
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonCard}></div>
          ))}
        </div>
      ) : filteredServers.length === 0 ? (
        <div className={styles.empty}>
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.br}`}>+</span>

          <div className={styles.emptyIconBox}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>NO MATCHING TARGET NODES</h3>
          <p className={styles.emptyDesc}>
            {servers.length === 0
              ? 'No target systems are currently registered. Register an HTTP/HTTPS health endpoint to enable passive uptime telemetry.'
              : 'No registered servers match the selected query or filter criteria. Try adjusting your search term or environment filters.'}
          </p>
          {isOperator && (
            <button
              type="button"
              className={styles.pillBtnOrange}
              onClick={() => setDialogOpen(true)}
            >
              <span>+ REGISTER FIRST TARGET</span>
              <span className={styles.arrowIcon}>↗</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredServers.map((server) => (
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
