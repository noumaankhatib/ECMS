import type { ProjectStatus } from '@ecms/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The small pieces every screen is built from.
 *
 * Kept deliberately plain. Nothing here holds state, and nothing here decides
 * what a person may do — pages pass that in, having asked the session.
 */

export function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}

export function CardHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="card__head">
      <h2>{title}</h2>
      {children ? <div className="row">{children}</div> : null}
    </header>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card__body">{children}</div>;
}

export function PageHead({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? ' / ' : ''}
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  );
}

/**
 * Nothing to show, and what to do about it.
 *
 * An empty table with nothing but headings leaves people wondering whether the
 * screen is broken or the data is missing. This says which.
 */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  DRAFT: 'badge--draft',
  ACTIVE: 'badge--active',
  ON_HOLD: 'badge--hold',
  COMPLETED: 'badge--complete',
  CLOSED: 'badge--closed',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

/**
 * A project's status.
 *
 * Always shows the word, not only the colour. Around one man in twelve cannot
 * reliably tell the green from the amber, and status is the single most
 * important thing on a project row.
 */
export function StatusBadge({ status }: { status: string }) {
  const known = status in STATUS_CLASS ? (status as ProjectStatus) : null;
  return (
    <span className={`badge ${known ? STATUS_CLASS[known] : ''}`}>
      {known ? STATUS_LABEL[known] : status}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge badge--plain">{children}</span>;
}

/** A date, or a dash. Never an empty cell that looks like a bug. */
export function DateText({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="faint">—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="faint">—</span>;
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
    </time>
  );
}

export function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <span className="faint">—</span>
  ) : (
    <>{children}</>
  );
}
