import styles from './SummaryCards.module.css';

const fmt = (v, d = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

const RISK_LEVELS = [
  { key: 'LOW', label: 'LOW', color: 'var(--status-healthy)' },
  { key: 'MEDIUM', label: 'MED', color: 'var(--status-recovering)' },
  { key: 'HIGH', label: 'HIGH', color: 'var(--status-degraded)' },
  { key: 'CRITICAL', label: 'CRIT', color: 'var(--status-critical)' },
];

export default function SummaryCards({ metrics, loading = false }) {
  if (loading || !metrics) {
    return (
      <section className={styles.grid} aria-label="Loading summary metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`${styles.card} ${styles.skeletonCard}`}>
            <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
            <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
            <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
            <span className={`${styles.crosshair} ${styles.br}`}>+</span>
            <div className={styles.skeletonLine} style={{ width: '40%' }}></div>
            <div className={styles.skeletonLineLarge} style={{ width: '60%' }}></div>
            <div className={styles.skeletonLine} style={{ width: '80%' }}></div>
          </div>
        ))}
      </section>
    );
  }

  const { totalExperiments, totalAnomalies, anomalyPercentage, riskDistribution } = metrics;
  const max = Math.max(1, totalExperiments);

  const cards = [
    {
      moduleTag: 'SYS.MODULE // EXPERIMENT-SUITE',
      label: 'TOTAL EXPERIMENTS',
      value: fmt(totalExperiments),
      caption: 'LOGGED FAULT RUNS ACROSS 3 SERVICES',
      indicator: 'var(--blue-primary)',
    },
    {
      moduleTag: 'AI.ENGINE // ISOLATION-FOREST',
      label: 'IDENTIFIED ANOMALIES',
      value: fmt(totalAnomalies),
      caption: 'MACHINE LEARNING OUTLIER DETECTIONS',
      indicator: 'var(--accent-orange)',
    },
    {
      moduleTag: 'STAT.RATIO // CASCADE-INCIDENCE',
      label: 'ANOMALY FREQUENCY',
      value: `${fmt(anomalyPercentage, 1)}%`,
      caption: 'PROPAGATION RATIO OF FAULT SUITE',
      indicator: 'var(--status-degraded)',
    },
    {
      moduleTag: 'RISK.MATRIX // SEVERITY-SPREAD',
      label: 'RESILIENCE RISK SPREAD',
      value: `${riskDistribution?.CRITICAL ?? 0} CRIT`,
      caption: 'LOW // MEDIUM // HIGH // CRITICAL',
      indicator: 'var(--status-critical)',
      bars: RISK_LEVELS.map((lvl) => ({
        color: lvl.color,
        width: Math.max(8, ((riskDistribution?.[lvl.key] ?? 0) / max) * 100),
        count: riskDistribution?.[lvl.key] ?? 0,
        label: lvl.label,
      })),
    },
  ];

  return (
    <section className={styles.grid} aria-label="System resilience summary metrics">
      {cards.map((card) => (
        <article key={card.label} className={styles.card}>
          {/* Blueprint Corner Crosshairs */}
          <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
          <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
          <span className={`${styles.crosshair} ${styles.br}`}>+</span>

          <div className={styles.cardHeader}>
            <span className={styles.moduleCaption}>{card.moduleTag}</span>
            <span className={styles.indicatorDot} style={{ backgroundColor: card.indicator }} />
          </div>

          <div className={styles.cardBody}>
            <span className={styles.cardValue}>{card.value}</span>
            <span className={styles.cardLabel}>{card.label}</span>
            <span className={styles.cardCaption}>{card.caption}</span>
          </div>

          {card.bars && (
            <div className={styles.riskBars} role="img" aria-label="Risk distribution bars">
              {card.bars.map((bar) => (
                <div
                  key={bar.label}
                  className={styles.barItem}
                  title={`${bar.label}: ${bar.count}`}
                >
                  <div
                    className={styles.bar}
                    style={{ width: `${bar.width}%`, backgroundColor: bar.color }}
                  />
                  <span className={styles.barLabel}>{bar.label} {bar.count}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
