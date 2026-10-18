import Link from 'next/link';

import { DateText, StatusBadge, Value } from '@/components/ui';
import type { Project } from '@/lib/types';

/**
 * The table behind Projects, Planning and Supervision. One component, so a
 * column added or a link fixed shows up in all three. Client, property and
 * manager are links to their own pages; the API sends them only to people who
 * may see them (otherwise they arrive as null and show as a dash), and the
 * columns are dropped for people who may see none of it.
 */
export function ProjectListTable({
  items,
  rowHref,
  cards,
  canClient,
  canProperty,
  canPeople,
}: {
  items: Project[];
  /** Where a row's code links: the overview, or the planning/supervision page. */
  rowHref: (project: Project) => string;
  /** Collapse to stacked cards on small screens (the Projects list does). */
  cards?: boolean;
  canClient: boolean;
  canProperty: boolean;
  canPeople: boolean;
}) {
  const label = (text: string): { 'data-label'?: string } => (cards ? { 'data-label': text } : {});
  return (
    <div className="table-scroll">
      <table className={cards ? 'table--cards' : undefined}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            {canClient ? <th>Client</th> : null}
            {canProperty ? <th>Property</th> : null}
            {canPeople ? <th>Manager</th> : null}
            <th>Status</th>
            <th>Target end</th>
          </tr>
        </thead>
        <tbody>
          {items.map((project) => (
            <tr key={project.id}>
              <td {...label('Code')} className="mono">
                <Link href={rowHref(project)}>{project.code}</Link>
              </td>
              <td {...label('Name')}>{project.name}</td>
              {canClient ? (
                <td {...label('Client')}>
                  {project.clientName ? (
                    <Link href={`/clients/${project.clientId}`}>{project.clientName}</Link>
                  ) : (
                    <Value>{null}</Value>
                  )}
                  {project.clientPhone ? <span className="cell-sub">{project.clientPhone}</span> : null}
                </td>
              ) : null}
              {canProperty ? (
                <td {...label('Property')}>
                  {project.propertyName ? (
                    <Link href={`/properties/${project.propertyId}`}>{project.propertyName}</Link>
                  ) : (
                    <Value>{null}</Value>
                  )}
                  {project.propertyLocation ? (
                    <span className="cell-sub">{project.propertyLocation}</span>
                  ) : null}
                </td>
              ) : null}
              {canPeople ? (
                <td {...label('Manager')}>
                  {project.managers && project.managers.length > 0 ? (
                    project.managers.map((manager, index) => (
                      <span key={manager.id} className="nowrap">
                        {index > 0 ? ', ' : null}
                        <Link href={`/users/${manager.id}`}>{manager.name}</Link>
                      </span>
                    ))
                  ) : (
                    <Value>{null}</Value>
                  )}
                </td>
              ) : null}
              <td {...label('Status')}>
                <StatusBadge status={project.status} />
              </td>
              <td {...label('Target end')} className="nowrap">
                <DateText value={project.targetEndDate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
