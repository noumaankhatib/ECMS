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

export function Badge({
  children,
  variant = 'plain',
}: {
  children: ReactNode;
  /** Defaults to the neutral, dot-less treatment every existing caller
   *  relies on. `success`/`critical` are filled pills for a status that
   *  should read as "good"/"needs attention" at a glance. `success-text`/
   *  `critical-text` are the same colours with no fill or dot — for a dense
   *  list of items where a full pill per item would be too heavy. */
  variant?: 'plain' | 'success' | 'critical' | 'success-text' | 'critical-text';
}) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

/**
 * A reference code — project number, client/property ID, drawing revision.
 *
 * Not plain text: this business's own registers (Planning No., Supervision
 * No., Municipality Application No., ...) treat these as the identity of a
 * piece of work, so they get a distinct bordered/mono treatment wherever
 * they appear, instead of blending into surrounding prose.
 */
export function CodeTag({ children }: { children: ReactNode }) {
  return <span className="code-tag">{children}</span>;
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

/**
 * Page-number navigation for a real, server-paginated list — "Showing X–Y of
 * Z", `Previous`/`Next`, and up to five nearby page numbers with an ellipsis
 * either side once the total run is longer than that. `buildHref` is given
 * the target page and returns the full URL, so this stays agnostic of
 * whichever other filters a given list page also carries in its query string.
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) {
    return (
      <p className="muted" style={{ fontSize: 13 }}>
        {total} {total === 1 ? 'record' : 'records'}
      </p>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const window = 2;
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - window; p <= page + window; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous > 1) items.push('ellipsis');
    items.push(p);
    previous = p;
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__summary">
        Showing {from}–{to} of {total}
      </span>
      <div className="pagination__controls">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="button button--secondary button--small">
            Previous
          </Link>
        ) : (
          <span className="button button--secondary button--small" aria-disabled="true">
            Previous
          </span>
        )}
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`e${index}`} className="pagination__ellipsis">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={buildHref(item)}
              className="pagination__page"
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </Link>
          ),
        )}
        {page < pageCount ? (
          <Link href={buildHref(page + 1)} className="button button--secondary button--small">
            Next
          </Link>
        ) : (
          <span className="button button--secondary button--small" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
