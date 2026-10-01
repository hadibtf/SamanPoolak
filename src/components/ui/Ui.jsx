import React from 'react';
import styles from './Ui.module.css';

const join = (...values) => values.filter(Boolean).join(' ');

export function Button({ variant = 'primary', loading = false, disabled, className, children, ...props }) {
  return <button type="button" {...props} disabled={disabled || loading} className={join(styles.button, styles[`button_${variant}`], className)} aria-busy={loading || undefined}>
    {loading && <span className={styles.spinner} aria-hidden="true" />}{children}
  </button>;
}

export function IconButton({ label, className, children, ...props }) {
  return <button {...props} type={props.type || 'button'} aria-label={label} title={props.title || label} className={join(styles.iconButton, className)}>{children}</button>;
}

export function Field({ label, htmlFor, hint, error, className, children }) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  return <div className={join(styles.field, className)}>
    {label && <label htmlFor={htmlFor} className={styles.fieldLabel}>{label}</label>}
    {React.isValidElement(children) && (hintId || errorId)
      ? React.cloneElement(children, { id: children.props.id || htmlFor, 'aria-describedby': [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' '), 'aria-invalid': error ? true : children.props['aria-invalid'] })
      : children}
    {hint && <small id={hintId} className={styles.hint}>{hint}</small>}
    {error && <small id={errorId} className={styles.error} role="alert">{error}</small>}
  </div>;
}

const controlProps = (props) => ({ ...props, className: join(styles.control, props.className) });
export function Input(props) { return <input {...controlProps(props)} />; }
export function Textarea(props) { return <textarea {...controlProps(props)} />; }
export function Select({ children, ...props }) { return <select {...controlProps(props)}>{children}</select>; }

export function StatusBadge({ tone = 'neutral', children, className }) {
  return <span className={join(styles.badge, styles[`badge_${tone}`], className)}>{children}</span>;
}

export function PageHeader({ title, description, actions, className }) {
  return <header className={join(styles.pageHeader, className)}><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className={styles.headerActions}>{actions}</div>}</header>;
}

export function SectionHeader({ title, description, actions, className }) {
  return <div className={join(styles.sectionHeader, className)}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className={styles.headerActions}>{actions}</div>}</div>;
}

export function Toolbar({ className, children, ...props }) {
  return <div {...props} className={join(styles.toolbar, className)}>{children}</div>;
}

export function EmptyState({ title, description, action, className }) {
  return <div className={join(styles.state, className)} role="status"><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingState({ label = 'در حال بارگذاری...', className }) {
  return <div className={join(styles.state, className)} role="status"><span className={styles.spinner} aria-hidden="true" /><span>{label}</span></div>;
}

export function ErrorState({ message, action, className }) {
  return <div className={join(styles.state, styles.errorState, className)} role="alert"><strong>{message}</strong>{action}</div>;
}
