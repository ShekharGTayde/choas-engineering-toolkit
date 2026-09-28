import { useState } from 'react';
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
  const upCount = recent.filter((h) => h.status === 'UP').length;
  const upPercent = Math.round((upCount / recent.length) * 100);

  return (
    <div className={styles.historyRow}>
      <span className={styles.historyLabel}>RECENT 20</span>
      <div className={styles.sparkline} title="Last 20 health checks">
        {recent.map((h, i) => (
          <span
            key={i}
            className={`${styles.spark} ${h.status === 'UP' ? styles.sparkUp : styles.sparkDown}`}
            title={`${h.status} · ${h.checkedAt ? new Date(h.checkedAt).toLocaleTimeString() : '—'}`}
          />
        ))}
      </div>
      <span className={styles.uptimePercent}>{upPercent}% UPTIME</span>
    </div>
  );
}

export default function ServerCard({ server, checking, onCheck, onDelete }) {
  const { isOperator } = useAuth();
  const [copied, setCopied] = useState(false);
  const isUp = server.status === 'UP';
  const envClass = ENV_COLORS[server.environment] || 'dev';

  const copyUrl = () => {
    navigator.clipboard.writeText(server.healthUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className={`${styles.card} ${isUp ? styles.cardUp : styles.cardDown}`}>
      {/* Blueprint Corner Crosshairs */}
      <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
      <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.br}`}>+</span>

      {/* Card Header */}
      <div className={styles.header}>
        <div className={styles.nameCol}>
          <span className={styles.nodeCode}>
            [NODE // {server.environment?.toUpperCase() || 'DEV'}]
          </span>
          <div className={styles.nameRow}>
            <span className={`${styles.statusDot} ${isUp ? styles.dotUp : styles.dotDown}`} />
            <h3 className={styles.name}>{server.name}</h3>
          </div>
        </div>

        <span className={`${styles.envBadge} ${styles[envClass]}`}>
          {server.environment}
        </span>
      </div>

      {/* URL Technical Codebox */}
      <div className={styles.urlBox}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className={styles.url} title={server.healthUrl}>{server.healthUrl}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={copyUrl}
          title="Copy URL"
          aria-label="Copy server health endpoint URL"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      {/* Hairline Metrics Grid */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>STATUS</span>
          <strong className={isUp ? styles.metricUp : styles.metricDown}>
            {server.status}
          </strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>HTTP CODE</span>
          <strong>{server.lastHttpStatus ?? '—'}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>LATENCY</span>
          <strong style={{ color: 'var(--blue-primary)' }}>
            {server.lastLatencyMs != null ? `${server.lastLatencyMs} ms` : '—'}
          </strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>LAST PROBE</span>
          <strong title={server.lastCheckedAt}>{timeAgo(server.lastCheckedAt)}</strong>
        </div>
      </div>

      {/* Error Callout (e.g. SSRF Protection) */}
      {!isUp && server.lastError && (
        <div className={styles.errorMsg}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className={styles.errorText}>
            <span className={styles.errorCode}>
              {server.lastError.includes('blocked') ? '[ERR.SECURITY_SSRF_BLOCKED]' : '[ERR.PROBE_FAILED]'}
            </span>
            <span>{server.lastError}</span>
          </div>
        </div>
      )}

      {/* History Sparkline */}
      <HistorySparkline history={server.history} />

      {/* Actions with Pill Buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnCheck}
          onClick={() => onCheck(server.id)}
          disabled={checking}
          aria-label={`Trigger health probe for ${server.name}`}
        >
          {checking ? (
            <>
              <span className={styles.miniSpinner} />
              <span>PROBING…</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              <span>CHECK NOW</span>
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
          <span>REMOVE</span>
        </button>
      </div>
    </article>
  );
}
