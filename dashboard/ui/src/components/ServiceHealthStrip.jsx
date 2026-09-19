import styles from './ServiceHealthStrip.module.css';

export default function ServiceHealthStrip({ services = [] }) {
  const allUp = services.every((s) => s.status === 'UP');

  return (
    <section className={styles.strip} aria-label="Target service health">
      <div className={styles.label}>
        <span className={`${styles.pulseDot} ${allUp ? styles.pulseHealthy : styles.pulseDegraded}`} />
        <span>Target service health</span>
      </div>
      <div className={styles.services}>
        {services.map((svc) => {
          const isUp = svc.status === 'UP';
          return (
            <div
              key={svc.name}
              className={`${styles.service} ${isUp ? styles.up : styles.down}`}
            >
              <span className={styles.dot} />
              <span className={styles.serviceName}>{svc.name} service</span>
              <span className={styles.statusText}>{isUp ? 'Operational' : 'Degraded / Down'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
