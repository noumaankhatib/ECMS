import { formatClientName } from '@ecms/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { api } from '@/lib/api';
import type { Session } from '@/lib/session';
import type { Client, Page, Project, ProjectMember, Property, Proposal } from '@/lib/types';
import { loadUserNames } from '@/lib/user-names';

export interface ContextChip {
  label: string;
  text: ReactNode;
  href?: string;
  /** A quieter second line: a phone number, a plot and village. */
  sub?: string | null | undefined;
}

/**
 * A row of small chips under a page title naming what the record belongs to —
 * its client, plot, project, the people on it — each one a link to that record.
 * Only the chips that exist are shown, so a page never carries a row of dashes.
 */
export function ContextStrip({ chips }: { chips: (ContextChip | null | false | undefined)[] }) {
  const shown = chips.filter((c): c is ContextChip => Boolean(c));
  if (shown.length === 0) return null;
  return (
    <ul className="context-strip">
      {shown.map((chip) => (
        <li key={chip.label} className="context-chip">
          <span className="context-chip__label">{chip.label}</span>
          <span className="context-chip__text">
            {chip.href ? <Link href={chip.href}>{chip.text}</Link> : chip.text}
          </span>
          {chip.sub ? <span className="context-chip__sub">{chip.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** "Plot 4512, Mabela, Seeb" from whichever parts exist. */
export function placeLine(property: {
  plotNumber?: string | null;
  village?: string | null;
  wilayat?: string | null;
}): string | null {
  return (
    [property.plotNumber ? `Plot ${property.plotNumber}` : null, property.village, property.wilayat]
      .filter(Boolean)
      .join(', ') || null
  );
}

/**
 * The context strip for any page about one project: client (with phone),
 * property (with plot and village), the project manager, and the proposal it
 * came from. Each lookup is skipped when the person may not see it, and a
 * lookup that fails simply drops its chip — the page never errors over it.
 */
export async function ProjectContext({
  project,
  session,
}: {
  project: Project;
  session: Pick<Session, 'can'>;
}) {
  const [client, property, members, source] = await Promise.all([
    session.can('client:view')
      ? api.get<Client>(`/clients/${project.clientId}`).catch(() => null)
      : null,
    session.can('property:view')
      ? api.get<Property>(`/properties/${project.propertyId}`).catch(() => null)
      : null,
    session.can('user:view')
      ? api.get<ProjectMember[]>(`/projects/${project.id}/members`).catch(() => null)
      : null,
    session.can('proposal:view')
      ? api
          .get<Page<Proposal>>(`/proposals?convertedProjectId=${project.id}&pageSize=1`)
          .then((page) => page.items[0] ?? null)
          .catch(() => null)
      : null,
  ]);

  const managerIds = (members ?? []).filter((m) => m.roleCode === 'PROJECT_MANAGER').map((m) => m.userId);
  const names = await loadUserNames(managerIds);

  return (
    <ContextStrip
      chips={[
        client && {
          label: 'Client',
          text: formatClientName(client),
          href: `/clients/${client.id}`,
          sub: client.mobileNumber,
        },
        property && {
          label: 'Property',
          text: property.name,
          href: `/properties/${property.id}`,
          sub: placeLine(property),
        },
        ...managerIds.flatMap((managerId, index) => {
          const name = names.get(managerId);
          return name
            ? [{ label: index === 0 ? 'Manager' : `Manager ${index + 1}`, text: name, href: `/users/${managerId}` }]
            : [];
        }),
        source && {
          label: 'From proposal',
          text: source.sketchNumber,
          href: `/proposals/${source.id}`,
        },
      ]}
    />
  );
}
