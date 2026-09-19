import styles from './SummaryCards.module.css';

const fmt = (v, d = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

const RISK_LEVELS = [
  { key: 'LOW', label: 'Low', color: 'var(--status-healthy)' },
  { key: 'MEDIUM', label: 'Medium', color: 'var(--status-recovering)' },
  { key: 'HIGH', label: 'High', color: 'var(--status-degraded)' },
  { key: 'CRITICAL', label: 'Critical', color: 'var(--status-critical)' },
];

export default function SummaryCards({ metrics }) {
  const { totalExperiments, totalAnomalies, anomalyPercentage, riskDistribution } = metrics;
  const max = Math.max(1, totalExperiments);

  const cards = [
    {
      title: 'Total Experiments',
      value: fmt(totalExperiments),
      caption: 'Logged fault runs',
      indicator: 'var(--accent-signal)',
    },
    {
      title: 'Identified Anomalies',
      value: fmt(totalAnomalies),
      caption: 'Isolation Forest detections',
      indicator: 'var(--status-critical)',
    },
    {
      title: 'Anomaly Frequency',
      value: `${fmt(anomalyPercentage, 1)}%`,
      caption: 'Of executed test suite',
      indicator: 'var(--status-degraded)',
    },
    {
      title: 'Resilience Risk Spread',
      value: `${riskDistribution?.CRITICAL ?? 0} critical`,
      caption: 'Low / Medium / High / Critical',
      indicator: 'var(--status-recovering)',
      bars: RISK_LEVELS.map((lvl) => ({
        color: lvl.color,
        width: Math.max(6, ((riskDistribution?.[lvl.key] ?? 0) / max) * 100),
        count: riskDistribution?.[lvl.key] ?? 0,
        label: lvl.label,
      })),
    },
  ];

  return (
    <section className={styles.grid} aria-label="System resilience summary metrics">
      {cards.map((card) => (
        <article key={card.title} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.indicatorDot} style={{ backgroundColor: card.indicator }} />
            <h3 className={styles.cardTitle}>{card.title}</h3>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue}>{card.value}</span>
            <span className={styles.cardCaption}>{card.caption}</span>
          </div>
          {card.bars && (
            <div className={styles.riskBars} role="img" aria-label="Risk distribution bars">
              {card.bars.map((bar) => (
                <div
                  key={bar.label}
                  className={styles.bar}
                  style={{ width: `${bar.width}%`, backgroundColor: bar.color }}
                  title={`${bar.label}: ${bar.count}`}
                />
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
