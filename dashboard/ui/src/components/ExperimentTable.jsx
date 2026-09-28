import { useMemo, useState } from 'react';
import Badge from './Badge.jsx';
import styles from './ExperimentTable.module.css';

const PAGE_SIZE = 12;
const fmt = (v, d = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

function ErrorRateCell({ rate }) {
  const r = Number(rate ?? 0);
  if (r >= 80) return <span className={styles.rateHigh}>{fmt(r, 1)}%</span>;
  if (r >= 40) return <span className={styles.rateMed}>{fmt(r, 1)}%</span>;
  return <span className={styles.rateOk}>{fmt(r, 1)}%</span>;
}

function FailureTypeCell({ type }) {
  const dot = styles[`dot_${type}`] || styles.dot_default;
  const label = type ? type.toUpperCase() : '—';
  return (
    <span className={styles.failureCell}>
      <span className={`${styles.dot} ${dot}`} />
      <span>{label}</span>
    </span>
  );
}

export default function ExperimentTable({
  experiments = [],
  selected,
  onSelect,
  search,
  onSearchChange,
  riskFilter,
  onRiskFilterChange,
  serviceFilter,
  onServiceFilterChange,
  loading = false,
}) {
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return experiments
      .filter((e) => !riskFilter || e.riskLevel === riskFilter)
      .filter((e) => !serviceFilter || e.targetService === serviceFilter)
      .filter((e) =>
        !q ||
        `${e.experimentId} ${e.targetService} ${e.failureType}`.toLowerCase().includes(q),
      );
  }, [experiments, search, riskFilter, serviceFilter]);

  useMemo(() => setPage(1), [filtered.length, search, riskFilter, serviceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className={styles.panel}>
      <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
      <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.br}`}>+</span>

      {/* Panel header */}
      <div className={styles.panelHead}>
        <div>
          <div className={styles.moduleTag}>[MODULE // AUDIT-LOG]</div>
          <h3 className={styles.panelTitle}>HISTORICAL FAULT SUITE</h3>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="SEARCH ID, SERVICE, FAULT…"
              aria-label="Search experiments"
              className={styles.searchInput}
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => onSearchChange('')} aria-label="Clear search">×</button>
            )}
          </div>

          <select
            value={riskFilter}
            onChange={(e) => onRiskFilterChange(e.target.value)}
            aria-label="Filter by risk level"
            className={styles.select}
          >
            <option value="">ALL RISK LEVELS</option>
            <option value="LOW">LOW RISK</option>
            <option value="MEDIUM">MEDIUM RISK</option>
            <option value="HIGH">HIGH RISK</option>
            <option value="CRITICAL">CRITICAL RISK</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => onServiceFilterChange(e.target.value)}
            aria-label="Filter by service"
            className={styles.select}
          >
            <option value="">ALL TARGET SERVICES</option>
            <option value="payment-service">PAYMENT-SERVICE</option>
            <option value="order-service">ORDER-SERVICE</option>
            <option value="notification-service">NOTIFICATION-SERVICE</option>
          </select>
        </div>
      </div>

      {/* Meta Bar */}
      <div className={styles.meta}>
        <span className={styles.metaCount}>
          INDEX: {filtered.length} OF {experiments.length} EXPERIMENTS
        </span>
        {filtered.length > PAGE_SIZE && (
          <span className={styles.pageMeta}>PAGE {safePage} / {totalPages}</span>
        )}
      </div>

      {/* Data Table with Hairline Rows */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>EXP ID</th>
              <th>TARGET SERVICE</th>
              <th>FAULT TYPE</th>
              <th>DURATION</th>
              <th>ERROR RATE</th>
              <th>RISK LEVEL</th>
              <th>ANOMALY STATUS</th>
              <th>RESILIENCE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className={styles.skeletonRow}>
                  <td colSpan={8}>
                    <div className={styles.skeletonLine}></div>
                  </td>
                </tr>
              ))
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  <div className={styles.emptyIcon}>[∅]</div>
                  <div>NO EXPERIMENTS MATCH QUERY OR CRITERIA.</div>
                </td>
              </tr>
            ) : (
              pageItems.map((exp) => {
                const isSelected = selected?.experimentId === exp.experimentId;
                const score = exp.resilienceScore != null ? Number(exp.resilienceScore) : null;
                return (
                  <tr
                    key={exp.experimentId}
                    className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                    onClick={() => onSelect(exp)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(exp);
                      }
                    }}
                  >
                    <td>
                      <span className={styles.idCell}>{exp.experimentId}</span>
                    </td>
                    <td>
                      <span className={styles.targetCell}>{exp.targetService}</span>
                    </td>
                    <td>
                      <FailureTypeCell type={exp.failureType} />
                    </td>
                    <td>
                      <span className={styles.monoCell}>{exp.duration}s</span>
                    </td>
                    <td>
                      <ErrorRateCell rate={exp.errorRate} />
                    </td>
                    <td>
                      <Badge variant={exp.riskLevel}>{exp.riskLevel || 'UNKNOWN'}</Badge>
                    </td>
                    <td>
                      {exp.anomalyLabel === 'ANOMALY' ? (
                        <span className={styles.anomalyBadge}>ANOMALY</span>
                      ) : (
                        <span className={styles.normalBadge}>NORMAL</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.scoreCell}>
                        {score != null ? `${fmt(score, 1)}` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Hairline Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            aria-label="Previous page"
          >
            ← PREV
          </button>
          <span className={styles.pageIndicator}>
            PAGE {safePage} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            aria-label="Next page"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}
