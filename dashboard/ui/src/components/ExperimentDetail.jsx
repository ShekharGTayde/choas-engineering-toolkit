import Badge from './Badge.jsx';
import styles from './ExperimentDetail.module.css';

const fmt = (v, d = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function StatCard({ label, value, className }) {
  return (
    <div className={`${styles.stat} ${className || ''}`}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
    </div>
  );
}

/** State 1 — no anomaly detected; LLM was intentionally skipped. */
function NoAnomalySection({ analysis }) {
  return (
    <section className={styles.section}>
      <div className={styles.aiSourceBadge + ' ' + styles.aiSourceNoAnomaly}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        ML: No Anomaly Detected · LLM Skipped
      </div>
      <h3 className={styles.sectionTitle}>System Behaviour Summary</h3>
      <p className={styles.analysisText}>{analysis.failureSummary}</p>
      <p className={styles.analysisText}>{analysis.resilienceAssessment}</p>
      {analysis.recommendations?.length > 0 && (
        <>
          <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>Baseline Recommendations</h3>
          <div className={styles.recommendationsList}>
            {analysis.recommendations.map((r, i) => (
              <div key={i} className={`${styles.recommendation} ${styles[`rec_${r.priority}`] || ''}`}>
                <div className={styles.recHeader}>
                  <Badge value={r.priority} />
                  <strong className={styles.recAction}>{r.action}</strong>
                </div>
                <p className={styles.recReason}>{r.reason}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** State 3 — anomaly detected but LLM failed; rule-based fallback used. */
function FallbackSection({ analysis }) {
  const sortedRecs = [...(analysis.recommendations || [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.aiSourceBadge + ' ' + styles.aiSourceFallback}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          ANOMALY · Rule-Based Fallback (LLM Unavailable)
        </div>
        <h3 className={styles.sectionTitle}>Anomaly Root Cause Analysis (Rule Engine)</h3>
        <div className={styles.proseContainer}>
          <p className={styles.analysisText}>{analysis.failureSummary}</p>
          <p className={styles.analysisText}>{analysis.resilienceAssessment}</p>
        </div>
      </section>

      {analysis.observedBehavior?.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Observed Behaviour</h3>
          <ul className={styles.observedList}>
            {analysis.observedBehavior.map((b, i) => (
              <li key={i} className={styles.observedItem}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {sortedRecs.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Actionable Fix Recommendations</h3>
          <div className={styles.recommendationsList}>
            {sortedRecs.map((r, i) => (
              <div key={i} className={`${styles.recommendation} ${styles[`rec_${r.priority}`] || ''}`}>
                <div className={styles.recHeader}>
                  <Badge value={r.priority} />
                  <strong className={styles.recAction}>{r.action}</strong>
                </div>
                <p className={styles.recReason}>{r.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.suggestedExperiments?.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Suggested Next Chaos Experiments</h3>
          <div className={styles.suggestions}>
            {analysis.suggestedExperiments.map((s, i) => (
              <div key={i} className={styles.suggestion}>
                <div className={styles.suggestionIcon}>
                  {s.failureType === 'stop' ? '⛔' : s.failureType === 'latency' ? '⏱' : '🔄'}
                </div>
                <div className={styles.suggestionContent}>
                  <strong className={styles.suggestionTitle}>
                    {s.failureType ? s.failureType.charAt(0).toUpperCase() + s.failureType.slice(1) : ''} fault on {s.targetService}
                  </strong>
                  <span className={styles.suggestionReason}>{s.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** State 2 — full Gemini AI analysis. */
function AiGeneratedSection({ analysis }) {
  const sortedRecs = [...(analysis.recommendations || [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.aiSourceBadge + ' ' + styles.aiSourceAi}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          ANOMALY · Gemini AI Analysis
        </div>
        <h3 className={styles.sectionTitle}>AI Root Cause &amp; Failure Analysis</h3>
        <div className={styles.proseContainer}>
          <p className={styles.analysisText}>{analysis.failureSummary}</p>
          <p className={styles.analysisText}>{analysis.resilienceAssessment}</p>
        </div>
      </section>

      {analysis.observedBehavior?.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Observed Behaviour</h3>
          <ul className={styles.observedList}>
            {analysis.observedBehavior.map((b, i) => (
              <li key={i} className={styles.observedItem}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {sortedRecs.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Actionable Fix Recommendations</h3>
          <div className={styles.recommendationsList}>
            {sortedRecs.map((r, i) => (
              <div key={i} className={`${styles.recommendation} ${styles[`rec_${r.priority}`] || ''}`}>
                <div className={styles.recHeader}>
                  <Badge value={r.priority} />
                  <strong className={styles.recAction}>{r.action}</strong>
                </div>
                <p className={styles.recReason}>{r.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.suggestedExperiments?.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Suggested Next Chaos Experiments</h3>
          <div className={styles.suggestions}>
            {analysis.suggestedExperiments.map((s, i) => (
              <div key={i} className={styles.suggestion}>
                <div className={styles.suggestionIcon}>
                  {s.failureType === 'stop' ? '⛔' : s.failureType === 'latency' ? '⏱' : '🔄'}
                </div>
                <div className={styles.suggestionContent}>
                  <strong className={styles.suggestionTitle}>
                    {s.failureType ? s.failureType.charAt(0).toUpperCase() + s.failureType.slice(1) : ''} fault on {s.targetService}
                  </strong>
                  <span className={styles.suggestionReason}>{s.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Dispatcher — picks the correct state panel based on analysisSource. */
function AiSection({ analysis }) {
  if (!analysis) {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>AI Root Cause &amp; Analysis</h3>
        <p className={styles.noAnalysis}>No saved AI analysis is available for this experiment.</p>
      </section>
    );
  }

  const source = analysis.analysisSource || 'ai-generated';

  if (source === 'no-anomaly') return <NoAnomalySection analysis={analysis} />;
  if (source === 'rule-based-fallback') return <FallbackSection analysis={analysis} />;
  return <AiGeneratedSection analysis={analysis} />;
}

export default function ExperimentDetail({ experiment }) {
  if (!experiment) {
    return (
      <aside className={styles.panel}>
        <div className={styles.empty}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className={styles.emptyEyebrow}>Inspect experiment</span>
          <h2 className={styles.emptyTitle}>Select an experiment</h2>
          <p className={styles.emptyDesc}>
            Choose an experiment from the registry to inspect system impact metrics, recovery duration, and AI recommendations.
          </p>
        </div>
      </aside>
    );
  }

  const errorRate = Number(experiment.errorRate ?? 0);
  const errClass =
    errorRate >= 80 ? styles.statDanger : errorRate >= 40 ? styles.statWarn : styles.statOk;

  return (
    <aside className={styles.panel}>
      <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
      <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.br}`}>+</span>

      <div className={styles.scroll}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <div className={styles.moduleTag}>[MODULE // TELEMETRY-INSPECTOR]</div>
            <span className={styles.eyebrow}>
              {experiment.experimentId} · {experiment.targetService.toUpperCase()}
            </span>
            <h2 className={styles.title}>
              {experiment.failureType ? experiment.failureType.toUpperCase() : ''} FAULT ANALYSIS
            </h2>
          </div>
          <div className={styles.badges}>
            <Badge value={experiment.riskLevel} />
            <Badge value={experiment.anomalyLabel} />
            <Badge value={experiment.experimentExecutionStatus} />
          </div>
        </div>

        {/* Stats grid */}
        <div className={styles.grid}>
          <StatCard label="Error rate" value={`${fmt(errorRate, 1)}%`} className={errClass} />
          <StatCard label="Recovery time" value={`${fmt(experiment.actualRecoveryDuration, 2)} s`} />
          <StatCard label="Affected services" value={fmt(experiment.affectedServiceCount)} />
          <StatCard
            label="Resilience score"
            value={experiment.resilienceScore == null ? '—' : fmt(experiment.resilienceScore, 1)}
            className={styles.statHighlight}
          />
          <StatCard
            label="Cascading failure"
            value={experiment.cascadingFailure ? 'Yes' : 'No'}
            className={experiment.cascadingFailure ? styles.statDanger : styles.statOk}
          />
          <StatCard label="Total requests" value={fmt(experiment.totalRequests)} />
          <StatCard label="Avg response" value={`${fmt(experiment.averageResponseTime, 0)} ms`} />
          <StatCard label="Peak response" value={`${fmt(experiment.peakResponseTime, 0)} ms`} />
        </div>

        {/* Latency info */}
        {experiment.failureType === 'latency' && experiment.injectedLatencyMilliseconds > 0 && (
          <div className={styles.infoRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Injected latency: <strong>{experiment.injectedLatencyMilliseconds} ms</strong></span>
          </div>
        )}

        {/* Affected services */}
        {Array.isArray(experiment.affectedServices) && experiment.affectedServices.length > 0 && (
          <div className={styles.infoRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            </svg>
            <span>Affected services: <strong>{experiment.affectedServices.join(', ')}</strong></span>
          </div>
        )}

        {/* 3-state AI Section */}
        <AiSection analysis={experiment.analysis} />
      </div>
    </aside>
  );
}
