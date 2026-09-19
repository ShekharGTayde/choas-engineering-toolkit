import styles from './Badge.module.css';

function formatLabel(val) {
  if (!val) return '—';
  // Convert CRITICAL -> Critical, IN_PROGRESS -> In progress, etc.
  const str = String(val).toLowerCase().replace(/_/g, ' ');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function Badge({ value }) {
  const upper = String(value || '').toUpperCase();
  const statusClass = styles[upper] || styles.UNKNOWN;

  return (
    <span className={`${styles.badge} ${statusClass}`}>
      <span className={styles.dot} />
      <span>{formatLabel(value)}</span>
    </span>
  );
}
