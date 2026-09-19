import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import styles from './LiveMetricsChart.module.css';

export default function LiveMetricsChart({ experiment }) {
  const [metricType, setMetricType] = useState('latency'); // 'latency' | 'errorRate'

  // Generate realistic time-series points for the experiment window
  const chartData = useMemo(() => {
    if (!experiment) {
      // Default baseline visualization if no experiment selected
      return Array.from({ length: 20 }, (_, i) => ({
        time: `00:${String(i * 2).padStart(2, '0')}`,
        latency: 45 + Math.sin(i) * 10,
        errorRate: 0,
        isFault: false,
      }));
    }

    const duration = experiment.configuredFailureDuration || 10;
    const avgLatency = experiment.averageResponseTime || 120;
    const peakLatency = experiment.peakResponseTime || 1200;
    const errorRate = experiment.errorRate || 0;
    const injectedLatency = experiment.injectedLatencyMilliseconds || 0;
    const recoveryDuration = experiment.actualRecoveryDuration || 3;

    const points = [];
    // 1. Pre-fault baseline (4 points)
    for (let i = 0; i < 4; i++) {
      points.push({
        time: `00:${String(i * 2).padStart(2, '0')}`,
        latency: Math.max(30, Math.round(45 + Math.random() * 15)),
        errorRate: 0,
        isFault: false,
        phase: 'Pre-fault Baseline',
      });
    }

    // 2. Fault window (6 points)
    const faultStartSec = 8;
    const faultSteps = 6;
    for (let i = 0; i < faultSteps; i++) {
      const sec = faultStartSec + Math.round((i * duration) / faultSteps);
      const isPeak = i === 2 || i === 3;
      const pointLatency = isPeak
        ? peakLatency
        : Math.round(avgLatency + (injectedLatency > 0 ? injectedLatency : Math.random() * 200));

      points.push({
        time: `00:${String(sec).padStart(2, '0')}`,
        latency: pointLatency,
        errorRate: isPeak ? errorRate : Math.round(errorRate * 0.8),
        isFault: true,
        phase: 'Fault Injected Window',
      });
    }

    // 3. Recovery period (3 points)
    const recoveryStartSec = faultStartSec + duration;
    for (let i = 1; i <= 3; i++) {
      const sec = recoveryStartSec + Math.round((i * recoveryDuration) / 3);
      const decRatio = (3 - i) / 3;
      points.push({
        time: `00:${String(sec).padStart(2, '0')}`,
        latency: Math.round(50 + decRatio * (avgLatency - 50)),
        errorRate: Math.round(decRatio * (errorRate * 0.3)),
        isFault: false,
        isRecovering: true,
        phase: 'System Recovery',
      });
    }

    // 4. Post-fault stabilized (4 points)
    const stabilizedStartSec = recoveryStartSec + Math.round(recoveryDuration) + 2;
    for (let i = 0; i < 4; i++) {
      const sec = stabilizedStartSec + (i * 2);
      points.push({
        time: `00:${String(sec).padStart(2, '0')}`,
        latency: Math.max(30, Math.round(46 + Math.random() * 12)),
        errorRate: 0,
        isFault: false,
        phase: 'Baseline Restored',
      });
    }

    return points;
  }, [experiment]);

  // Find fault window boundary times for shaded band
  const faultStart = chartData.find((p) => p.isFault)?.time || null;
  const faultEnd = [...chartData].reverse().find((p) => p.isFault)?.time || null;
  const recoveryPoint = chartData.find((p) => p.isRecovering)?.time || null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint = payload[0].payload;
    return (
      <div className={styles.tooltip}>
        <div className={styles.tooltipTime}>{label} · {dataPoint.phase}</div>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>Latency:</span>
          <span className={styles.tooltipVal}>{dataPoint.latency} ms</span>
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>Error Rate:</span>
          <span className={styles.tooltipVal}>{dataPoint.errorRate}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.info}>
          <span className={styles.eyebrow}>
            {experiment ? `${experiment.experimentId} · ${experiment.targetService}` : 'Live Observability'}
          </span>
          <h2 className={styles.title}>System Response & Failure Timeline</h2>
        </div>

        <div className={styles.controls}>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDotFault}></span>
              <span>Fault window ({experiment?.configuredFailureDuration || 10}s)</span>
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDotRecovery}></span>
              <span>Recovery mark</span>
            </span>
          </div>

          <div className={styles.typeSelector}>
            <button
              type="button"
              className={`${styles.typeBtn} ${metricType === 'latency' ? styles.typeBtnActive : ''}`}
              onClick={() => setMetricType('latency')}
            >
              Latency (ms)
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${metricType === 'errorRate' ? styles.typeBtnActive : ''}`}
              onClick={() => setMetricType('errorRate')}
            >
              Error Rate (%)
            </button>
          </div>
        </div>
      </div>

      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 12, right: 18, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="rgba(84, 119, 146, 0.18)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="var(--text-secondary)"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
            />
            <YAxis
              stroke="var(--text-secondary)"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              unit={metricType === 'latency' ? 'ms' : '%'}
            />
            <Tooltip content={<CustomTooltip />} />

            {faultStart && faultEnd && (
              <ReferenceArea
                x1={faultStart}
                x2={faultEnd}
                fill="var(--status-critical)"
                fillOpacity={0.16}
                stroke="var(--status-critical)"
                strokeOpacity={0.3}
                strokeDasharray="2 2"
              />
            )}

            {recoveryPoint && (
              <ReferenceLine
                x={recoveryPoint}
                stroke="var(--status-recovering)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: 'Recovered',
                  fill: 'var(--status-recovering)',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono',
                  position: 'insideTopRight',
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey={metricType === 'latency' ? 'latency' : 'errorRate'}
              stroke={metricType === 'latency' ? 'var(--accent-signal)' : 'var(--status-critical)'}
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--bg-surface)', strokeWidth: 1.5 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.footerSummary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Pre-Fault Baseline:</span>
          <span className={styles.summaryVal}>~45 ms</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Peak Degradation:</span>
          <span className={styles.summaryVal}>
            {experiment ? `${experiment.peakResponseTime || 0} ms` : '—'}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Recovery Time:</span>
          <span className={styles.summaryVal}>
            {experiment ? `${experiment.actualRecoveryDuration || 0} s` : '—'}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Failure Status:</span>
          <span className={styles.summaryVal}>
            {experiment?.cascadingFailure ? 'Cascading failure detected' : 'Isolated failure'}
          </span>
        </div>
      </div>
    </div>
  );
}
