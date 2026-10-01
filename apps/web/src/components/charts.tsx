/**
 * The two chart shapes the dashboard needs — a status donut and a funnel —
 * both plain inline SVG/CSS, matching this codebase's "no new dependency"
 * rule (`shared/csv/to-csv.ts`, this file's own web equivalent). Neither
 * relies on colour alone: every segment and bar carries its own label and
 * number alongside the colour, the same rule `StatusBadge` already follows.
 *
 * The chart itself stays clean — label, bar/swatch, count. An optional
 * `details` per segment/stage turns its row into a trigger for the exact
 * share, stage context and a link to the matching filtered list.
 */
import type { ReactNode } from 'react';

import { Details, type DetailsContent } from './popover';

/** A row with `details` becomes its own trigger; one without stays plain. */
function Row({
  details,
  className,
  children,
}: {
  details: DetailsContent | undefined;
  className: string;
  children: ReactNode;
}) {
  return details ? (
    <Details as="li" trigger="area" content={details} className={className}>
      {children}
    </Details>
  ) : (
    <li className={className}>{children}</li>
  );
}

const R = 54;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string; details?: DetailsContent }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let offset = 0;

  return (
    <div className="donut">
      <svg
        viewBox="0 0 140 140"
        className="donut__svg"
        role="img"
        aria-label="Project status breakdown"
      >
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--slate-100)" strokeWidth={STROKE} />
        {total === 0
          ? null
          : segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const fraction = s.value / total;
                const dash = fraction * CIRCUMFERENCE;
                const circle = (
                  <circle
                    key={s.label}
                    cx="70"
                    cy="70"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 70 70)"
                  />
                );
                offset += dash;
                return circle;
              })}
        <text x="70" y="66" textAnchor="middle" className="donut__total-value">
          {total}
        </text>
        <text x="70" y="82" textAnchor="middle" className="donut__total-label">
          total
        </text>
      </svg>

      <ul className="donut__legend">
        {segments.map((s) => (
          <Row
            key={s.label}
            details={s.details}
            className={`donut__legend-item ${s.value === 0 ? 'donut__legend--zero' : ''}`}
          >
            <span className="donut__swatch" style={{ background: s.color }} />
            <span className="donut__legend-label">{s.label}</span>
            <strong>{s.value}</strong>
          </Row>
        ))}
      </ul>
    </div>
  );
}

export function Funnel({
  stages,
}: {
  stages: {
    label: string;
    value: number;
    color?: string | undefined;
    details?: DetailsContent;
  }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <ul className="funnel">
      {stages.map((s) => (
        <Row
          key={s.label}
          details={s.details}
          className={`funnel__item ${s.value === 0 ? 'funnel--zero' : ''}`}
        >
          <span className="funnel__label">{s.label}</span>
          <span className="funnel__track">
            <span
              className="funnel__fill"
              style={{
                width: `${s.value === 0 ? 0 : Math.max(4, (s.value / max) * 100)}%`,
                background: s.value === 0 ? 'var(--slate-200)' : (s.color ?? 'var(--brand-700)'),
              }}
            />
          </span>
          <strong className="funnel__value">{s.value}</strong>
        </Row>
      ))}
    </ul>
  );
}
