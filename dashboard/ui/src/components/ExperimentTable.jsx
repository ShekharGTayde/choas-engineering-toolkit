import { useMemo, useState } from 'react';
import Badge from './Badge.jsx';
import styles from './ExperimentTable.module.css';

const PAGE_SIZE = 15;
const fmt = (v, d = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

function ErrorRateCell({ rate }) {
  const r = Number(rate ?? 0);
  if (r >= 80) return <span className={styles.rateHigh}>{fmt(r, 1)}%</span>;
  if (r >= 40) return <span className={styles.rateMed}>{fmt(r, 1)}%</span>;
  return <span className={styles.rateOk}>{fmt(r, 1)}%</span>;
}

function FailureTypeCell({ type }) {
  const dot = styles[`dot_${type}`] || styles.dot_default;
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : '—';
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

  // Reset page when filters change
  useMemo(() => setPage(1), [filtered.length, search, riskFilter, serviceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className={styles.panel}>
      {/* Panel header */}
      <div className={styles.panelHead}>
        <div>
          <span className={styles.eyebrow}>Experiment Registry</span>
          <h2 className={styles.panelTitle}>Past & Executed Experiments</h2>
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
              placeholder="Search ID, service, fault…"
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
            <option value="">All risk levels</option>
            <option value="LOW">Low risk</option>
            <option value="MEDIUM">Medium risk</option>
            <option value="HIGH">High risk</option>
            <option value="CRITICAL">Critical risk</option>
          </select>
          <select
            value={serviceFilter}
            onChange={(e) => onServiceFilterChange(e.target.value)}
            aria-label="Filter by service"
            className={styles.select}
          >
            <option value="">All services</option>
            <option value="payment-service">Payment</option>
            <option value="order-service">Order</option>
            <option value="notification-service">Notification</option>
          </select>
        </div>
      </div>

      {/* Meta row */}
      <div className={styles.meta}>
        <span>
          {filtered.length === experiments.length
            ? `${experiments.length} experiments recorded`
            : `${filtered.length} of ${experiments.length} experiments`}
        </span>
        {filtered.length > PAGE_SIZE && (
          <span className={styles.pageMeta}>Page {safePage} of {totalPages}</span>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Experiment ID</th>
              <th>Target</th>
              <th>Fault Type</th>
              <th>Duration</th>
              <th>Error Rate</th>
              <th>Risk Level</th>
              <th>Anomaly</th>
              <th>Resilience Score</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  No experiments match the specified search or filter criteria.
                </td>
              </tr>
            ) : (
              pageItems.map((exp) => (
                <tr
                  key={exp.experimentId}
                  onClick={() => onSelect(exp)}
                  className={selected?.experimentId === exp.experimentId ? styles.active : ''}
                >
                  <td><span className={styles.expId}>{exp.experimentId}</span></td>
                  <td className={styles.service}>{exp.targetService?.replace('-service', '')}</td>
                  <td><FailureTypeCell type={exp.failureType} /></td>
                  <td className={styles.mono}>{exp.configuredFailureDuration}s</td>
                  <td><ErrorRateCell rate={exp.errorRate} /></td>
                  <td><Badge value={exp.riskLevel} /></td>
                  <td><Badge value={exp.anomalyLabel} /></td>
                  <td className={styles.mono}>
                    {exp.resilienceScore == null ? '—' : fmt(exp.resilienceScore, 1)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            Previous
          </button>
          <div className={styles.pageNumbers}>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className={styles.ellipsis}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${styles.pageBtn} ${p === safePage ? styles.activePage : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
          </div>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
