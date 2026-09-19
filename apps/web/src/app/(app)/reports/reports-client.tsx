'use client';

import { useState } from 'react';

import {
  ClientsIcon,
  IssuesIcon,
  ProjectsIcon,
  PropertiesIcon,
  ProposalsIcon,
} from '@/components/icons';

const PERIODS = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'] as const;
type Period = (typeof PERIODS)[number];

/**
 * The same `/export/*.csv` pass-through links every list page already
 * offers (`clients/page.tsx`'s "Export CSV" button, etc.) — gathered into
 * one place rather than a new export mechanism. Each card is only shown
 * when `show` is true, computed server-side in `page.tsx` from the same
 * view permission that page already required.
 */
export function ReportsClient({
  cards,
}: {
  cards: {
    key: 'projects' | 'proposals' | 'clients' | 'properties' | 'issues';
    title: string;
    description: string;
    href: string;
    show: boolean;
  }[];
}) {
  const [period, setPeriod] = useState<Period>('Monthly');

  const ICONS = {
    projects: ProjectsIcon,
    proposals: ProposalsIcon,
    clients: ClientsIcon,
    properties: PropertiesIcon,
    issues: IssuesIcon,
  } as const;

  const visible = cards.filter((card) => card.show);

  return (
    <>
      <div className="period-toggle" role="group" aria-label="Reporting period">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={`period-toggle__button ${p === period ? 'period-toggle__button--active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-2)' }}>
        Every export below reflects the register&apos;s current state, not the{' '}
        {period.toLowerCase()} window selected — these exports do not filter by period today.
      </p>

      {visible.length === 0 ? (
        <p className="muted" style={{ marginTop: 'var(--space-4)' }}>
          You do not currently hold a view permission on any exportable register.
        </p>
      ) : (
        <div className="report-grid" style={{ marginTop: 'var(--space-4)' }}>
          {visible.map((card) => {
            const Icon = ICONS[card.key];
            return (
              <a key={card.key} href={card.href} className="report-card">
                <span className="report-card__icon">
                  <Icon width={20} height={20} />
                </span>
                <span className="report-card__title">{card.title}</span>
                <span className="report-card__description">{card.description}</span>
                <span className="report-card__cta">Download CSV</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
