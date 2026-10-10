import styles from './BottomSheet.module.css';

const BottomSheet = ({ children, className = '', onClose }) => (
  <div
    className={`${styles.overlay} modal-overlay`}
    onClick={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}
  >
    <div className={`${styles.sheet} modal-content ${className}`.trim()}>
      {children}
    </div>
  </div>
);

export default BottomSheet;
