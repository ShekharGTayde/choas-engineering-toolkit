import styles from './ErrorScreen.module.css';

export default function ErrorScreen({ message, onRetry }) {
  return (
    <div className={styles.screen}>
      <div className={styles.icon}>⚠️</div>
      <h2 className={styles.title}>Dashboard unavailable</h2>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.btn} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
