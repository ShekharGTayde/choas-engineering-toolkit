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
  const [metricType, setMetricType] = useState('both'); // 'latency' | 'errorRate' | 'both'

  // Generate realistic time-series points for the experiment window
  const chartData = useMemo(() => {
    if (!experiment) {
      return Array.from({ length: 20 }, (_, i) => ({
        time: `00:${String(i * 2).padStart(2, '0')}`,
        latency: 45 + Math.sin(i) * 10,
        errorRate: 0,
        isFault: false,
        phase: 'Steady State Baseline',
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
        latency: Math.max(30, Math.round(45 + Math.random() * 12)),
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
        : Math.round(avgLatency + (injectedLatency > 0 ? injectedLatency : Math.random() * 180));

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
        phase: 'System Recovery (Circuit Breaker Tripped)',
      });
    }

    // 4. Post-fault stabilized (4 points)
    const stabilizedStartSec = recoveryStartSec + Math.round(recoveryDuration) + 2;
    for (let i = 0; i < 4; i++) {
      const sec = stabilizedStartSec + (i * 2);
      points.push({
        time: `00:${String(sec).padStart(2, '0')}`,
        latency: Math.max(30, Math.round(44 + Math.random() * 10)),
        errorRate: 0,
        isFault: false,
        phase: 'Baseline Restored',
      });
    }

    return points;
  }, [experiment]);

  const faultStart = chartData.find((p) => p.isFault)?.time || null;
  const faultEnd = [...chartData].reverse().find((p) => p.isFault)?.time || null;
  const recoveryPoint = chartData.find((p) => p.isRecovering)?.time || null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint = payload[0].payload;
    return (
      <div className={styles.tooltip}>
        <div className={styles.tooltipHeader}>
          <span className={styles.tooltipTime}>T+{label}</span>
          <span className={styles.tooltipPhase}>{dataPoint.phase}</span>
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>
            <span className={styles.legendDotBlue}></span> LATENCY
          </span>
          <span className={styles.tooltipVal}>{dataPoint.latency} ms</span>
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>
            <span className={styles.legendDotOrange}></span> ERROR RATE
          </span>
          <span className={styles.tooltipVal}>{dataPoint.errorRate}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.chartPanel}>
      <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
      <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
      <span className={`${styles.crosshair} ${styles.br}`}>+</span>

      <div className={styles.panelHeader}>
        <div className={styles.headerInfo}>
          <div className={styles.moduleTag}>
            [MODULE // TELEMETRY-OSCILLOSCOPE]
            {experiment && ` · [ID: ${experiment.experimentId}]`}
          </div>
          <h3 className={styles.panelTitle}>
            {experiment
              ? `${experiment.targetService.toUpperCase()} // ${experiment.faultType?.toUpperCase() || 'FAULT'} DYNAMICS`
              : 'REAL-TIME FAULT PROPAGATION DYNAMICS'}
          </h3>
        </div>

        <div className={styles.controls}>
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDotBlue}></span>
              <span>LATENCY (MS)</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotOrange}></span>
              <span>ERROR RATE (%)</span>
            </div>
            {faultStart && (
              <div className={styles.legendItem}>
                <span className={styles.legendBoxFault}></span>
                <span>FAULT WINDOW ({experiment?.configuredFailureDuration || 10}S)</span>
              </div>
            )}
          </div>

          <div className={styles.typeSelector}>
            <button
              type="button"
              className={`${styles.pillToggle} ${metricType === 'both' ? styles.pillActive : ''}`}
              onClick={() => setMetricType('both')}
            >
              DUAL PLOT
            </button>
            <button
              type="button"
              className={`${styles.pillToggle} ${metricType === 'latency' ? styles.pillActive : ''}`}
              onClick={() => setMetricType('latency')}
            >
              LATENCY
            </button>
            <button
              type="button"
              className={`${styles.pillToggle} ${metricType === 'errorRate' ? styles.pillActive : ''}`}
              onClick={() => setMetricType('errorRate')}
            >
              ERROR %
            </button>
          </div>
        </div>
      </div>

      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 16, right: 20, left: -8, bottom: 0 }}>
            {/* Thin gridlines, no heavy fills */}
            <CartesianGrid
              stroke="rgba(127, 146, 245, 0.18)"
              strokeDasharray="3 3"
              vertical={true}
            />
            <XAxis
              dataKey="time"
              stroke="#7F92F5"
              tick={{ fill: '#7F92F5', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: 'rgba(127, 146, 245, 0.4)' }}
              axisLine={{ stroke: 'rgba(127, 146, 245, 0.4)' }}
            />
            <YAxis
              yAxisId="left"
              stroke="#7F92F5"
              tick={{ fill: '#7F92F5', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: 'rgba(127, 146, 245, 0.4)' }}
              axisLine={{ stroke: 'rgba(127, 146, 245, 0.4)' }}
              unit="ms"
            />
            {metricType !== 'latency' && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#FF6A2B"
                domain={[0, 100]}
                tick={{ fill: '#FF6A2B', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={{ stroke: 'rgba(255, 106, 43, 0.4)' }}
                axisLine={{ stroke: 'rgba(255, 106, 43, 0.4)' }}
                unit="%"
              />
            )}
            <Tooltip content={<CustomTooltip />} />

            {/* Shaded Fault Window without heavy fills */}
            {faultStart && faultEnd && (
              <ReferenceArea
                yAxisId="left"
                x1={faultStart}
                x2={faultEnd}
                fill="rgba(255, 106, 43, 0.12)"
                stroke="#FF6A2B"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            )}

            {/* Recovery Mark */}
            {recoveryPoint && (
              <ReferenceLine
                yAxisId="left"
                x={recoveryPoint}
                stroke="#7F92F5"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: 'RECOVERED',
                  fill: '#FFFFFF',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono',
                  position: 'insideTopRight',
                }}
              />
            )}

            {/* Blue line: Latency */}
            {(metricType === 'both' || metricType === 'latency') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="latency"
                stroke="#7F92F5"
                strokeWidth={2.2}
                dot={{ r: 2.5, fill: '#1E32B5', stroke: '#7F92F5', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#FFFFFF', stroke: '#7F92F5', strokeWidth: 2 }}
                animationDuration={600}
              />
            )}

            {/* Orange line: Error Rate */}
            {(metricType === 'both' || metricType === 'errorRate') && (
              <Line
                yAxisId={metricType === 'both' ? 'right' : 'left'}
                type="monotone"
                dataKey="errorRate"
                stroke="#FF6A2B"
                strokeWidth={2.2}
                dot={{ r: 2.5, fill: '#1E32B5', stroke: '#FF6A2B', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#FFFFFF', stroke: '#FF6A2B', strokeWidth: 2 }}
                animationDuration={600}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.footerSpecs}>
        <div className={styles.specCell}>
          <span className={styles.specLabel}>BASELINE RT:</span>
          <span className={styles.specValue}>~45 MS</span>
        </div>
        <div className={styles.specCell}>
          <span className={styles.specLabel}>PEAK DEGRADATION:</span>
          <span className={styles.specValue}>
            {experiment ? `${experiment.peakResponseTime || experiment.avgResponseTime || 0} MS` : '—'}
          </span>
        </div>
        <div className={styles.specCell}>
          <span className={styles.specLabel}>RECOVERY TIME:</span>
          <span className={styles.specValue}>
            {experiment ? `${experiment.actualRecoveryDuration || experiment.duration || 0} SEC` : '—'}
          </span>
        </div>
        <div className={styles.specCell}>
          <span className={styles.specLabel}>CASCADE IMPACT:</span>
          <span className={`${styles.specValue} ${experiment?.cascadingFailure ? styles.cascadeWarning : ''}`}>
            {experiment?.cascadingFailure ? 'CASCADING TO DOWNSTREAM' : 'ISOLATED TO TARGET'}
          </span>
        </div>
      </div>
    </div>
  );
}
