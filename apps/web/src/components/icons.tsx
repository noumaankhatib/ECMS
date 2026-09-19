/**
 * A small, hand-drawn icon set — one per navigation item plus the header
 * controls. No icon library is added (the same "no new dependency" choice
 * `shared/csv/to-csv.ts` already made): every icon below is a 20x20 stroke
 * glyph, sharing one stroke width and cap style so the set reads as one
 * family rather than mixed provenance.
 */
import type { SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

export function ProjectsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Icon>
  );
}

export function ProposalsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Icon>
  );
}

export function ClientsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 6.5a3 3 0 0 1 0 5.9" />
      <path d="M17 14.2a6.5 6.5 0 0 1 4.5 5.8" />
    </Icon>
  );
}

export function PropertiesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

export function SketchTypesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 21v-4l11-11 4 4-11 11Z" />
      <path d="M13 6l4 4" />
    </Icon>
  );
}

/** A drafting compass — planning work, before anything is built. */
export function PlanningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v3" />
      <path d="M9 21l3-9 3 9" />
      <path d="M8 21h8" />
      <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** A clipboard with a check — the site-visit inspection record. */
export function SupervisionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function DocumentsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 13l2 2 4-4" />
    </Icon>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M2.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M14.5 20a4.2 4.2 0 0 1 7 0" />
    </Icon>
  );
}

export function IssuesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 4 21 19H3Z" />
      <path d="M12 10v4" />
      <path d="M12 16.5v.1" />
    </Icon>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function TrendUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 17 10 10l4 4 7-7" />
      <path d="M15 6h6v6" />
    </Icon>
  );
}

export function TrendDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 7 10 14l4-4 7 7" />
      <path d="M15 17h6v-6" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.4-2-3.4-2.2.8a7.6 7.6 0 0 0-2.6-1.5L14 2.8h-4l-.5 2.2a7.6 7.6 0 0 0-2.6 1.5l-2.2-.8-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 14.9l2 3.4 2.2-.8c.77.65 1.65 1.16 2.6 1.5l.5 2.2h4l.5-2.2a7.6 7.6 0 0 0 2.6-1.5l2.2.8 2-3.4Z" />
    </Icon>
  );
}

export function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.8 2.8 0 0 1 5.4.9c0 1.8-2.5 2.1-2.5 3.8" />
      <path d="M12 17.3v.1" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15 5 8 12l7 7" />
    </Icon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  );
}

/** The calendar-picker trigger on a DateField. */
export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Reports & analytics — a small bar chart, distinct from the dashboard's
 *  quadrant glyph. */
export function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </Icon>
  );
}

export function ApprovalsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 12l2 2 4-4" />
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
    </Icon>
  );
}

/** The Quick Create trigger, and any other "add new" affordance. */
export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function AdminDataIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
      <path d="M8 3v3M12 3v3M16 3v3" />
    </Icon>
  );
}

/** Dismisses the command palette / a modal. */
export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth="2">
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}
