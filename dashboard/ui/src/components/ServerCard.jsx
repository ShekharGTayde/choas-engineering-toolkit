import { useAuth } from '../context/AuthContext.jsx';
import styles from './ServerCard.module.css';

const ENV_COLORS = {
  Production: 'prod',
  Staging: 'staging',
  Development: 'dev',
};

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function HistorySparkline({ history }) {
  if (!history || history.length === 0) return null;
  const recent = [...history].reverse().slice(0, 20);
  return (
    <div className={styles.sparkline} title="Last 20 checks">
      {recent.map((h, i) => (
        <span
          key={i}
          className={`${styles.spark} ${h.status === 'UP' ? styles.sparkUp : styles.sparkDown}`}
          title={`${h.status} · ${h.checkedAt ? new Date(h.checkedAt).toLocaleTimeString() : '—'}`}
        />
      ))}
    </div>
  );
}

export default function ServerCard({ server, checking, onCheck, onDelete }) {
  const { isOperator } = useAuth();
  const isUp = server.status === 'UP';
  const envClass = ENV_COLORS[server.environment] || 'dev';

  return (
    <div className={`${styles.card} ${isUp ? styles.cardUp : styles.cardDown}`}>
      {/* Card header */}
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={`${styles.statusDot} ${isUp ? styles.dotUp : styles.dotDown}`} />
          <h3 className={styles.name}>{server.name}</h3>
        </div>
        <span className={`${styles.envBadge} ${styles[envClass]}`}>
          {server.environment}
        </span>
      </div>

      {/* URL */}
      <div className={styles.urlRow}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className={styles.url} title={server.healthUrl}>{server.healthUrl}</span>
      </div>

      {/* Quick stats */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Status</span>
          <strong className={isUp ? styles.metricUp : styles.metricDown}>
            {server.status}
          </strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>HTTP Code</span>
          <strong>{server.lastHttpStatus ?? '—'}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Latency</span>
          <strong>{server.lastLatencyMs != null ? `${server.lastLatencyMs} ms` : '—'}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Last Probe</span>
          <strong title={server.lastCheckedAt}>{timeAgo(server.lastCheckedAt)}</strong>
        </div>
      </div>

      {/* Error message if down */}
      {!isUp && server.lastError && (
        <div className={styles.errorMsg}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{server.lastError}</span>
        </div>
      )}

      {/* History sparkline */}
      <div className={styles.historyRow}>
        <span className={styles.historyLabel}>Recent 20</span>
        <HistorySparkline history={server.history} />
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnCheck}
          onClick={() => onCheck(server.id)}
          disabled={checking}
        >
          {checking ? (
            <>
              <span className={styles.miniSpinner} />
              <span>Probing…</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              <span>Check Now</span>
            </>
          )}
        </button>

        <button
          type="button"
          className={styles.btnDelete}
          onClick={() => onDelete(server.id)}
          disabled={checking || !isOperator}
          title={!isOperator ? 'Operator role required to remove servers' : 'Remove server from monitoring'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          <span>Remove</span>
        </button>
      </div>
    </div>
  );
}
