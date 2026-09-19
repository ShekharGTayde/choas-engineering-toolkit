import styles from './Toast.module.css';

export default function Toast({ message, type = 'info' }) {
  return (
    <div className={`${styles.toast} ${styles[type] || ''}`} role="status">
      <span className={styles.icon}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      {message}
    </div>
  );
}
