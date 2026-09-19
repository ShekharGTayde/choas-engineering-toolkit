import styles from './LoadingScreen.module.css';

export default function LoadingScreen() {
  return (
    <div className={styles.screen}>
      <div className={styles.spinner} />
      <p className={styles.label}>Loading dashboard…</p>
    </div>
  );
}
