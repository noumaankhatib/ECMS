'use client';

import type { RoleDetail } from '@ecms/contracts';
import { useState } from 'react';

import { actionMeta, areasOf, compareCell, summariseRoles, type AreaLine } from '@/lib/role-guide';

import { Select } from './form';

/**
 * Explains what a role allows, in the order a person decides: who the role is
 * for, what it may do anywhere, and what it may do only inside projects the
 * person has been added to.
 */

function AreaList({ lines }: { lines: readonly AreaLine[] }) {
  return (
    <dl className="role-guide__list">
      {lines.map((line) => (
        <div key={line.area} className="role-guide__row">
          <dt>{line.area}</dt>
          <dd>
            {line.actions.map((action) => {
              const { sensitive, detail } = actionMeta(action);
              return (
                <span
                  key={action}
                  className={`role-chip${sensitive ? ' role-chip--sensitive' : ''}`}
                  {...(detail ? { title: detail } : {})}
                >
                  {action}
                </span>
              );
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What the given roles allow together. Used on a user's page and in the picker. */
export function RolePermissions({
  roles,
  emptyText,
}: {
  roles: readonly RoleDetail[];
  emptyText: string;
}) {
  const summary = summariseRoles(roles);
  if (summary.anywhere.length === 0 && summary.inProjects.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }
  return (
    <div className="role-guide__groups">
      <p className="role-guide__legend">
        <span className="role-chip role-chip--sensitive">Highlighted</span> abilities change records
        for good, approve work or bypass a check.
      </p>
      {summary.anywhere.length > 0 ? (
        <section>
          <h3 className="role-guide__heading">Anywhere in the portfolio</h3>
          <AreaList lines={summary.anywhere} />
        </section>
      ) : null}
      {summary.inProjects.length > 0 ? (
        <section>
          <h3 className="role-guide__heading">Only in projects they are added to</h3>
          <AreaList lines={summary.inProjects} />
        </section>
      ) : null}
    </div>
  );
}

function CompareTable({ roles }: { roles: readonly RoleDetail[] }) {
  const areas = areasOf(roles);
  return (
    <details className="role-guide__compare">
      <summary>Compare all roles</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              {roles.map((role) => (
                <th key={role.code}>{role.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area}>
                <th scope="row">{area}</th>
                {roles.map((role) => {
                  const cell = compareCell(role, area);
                  return (
                    <td key={role.code} className={cell.text ? undefined : 'muted'}>
                      {cell.text || '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">† applies only in projects the person has been added to.</p>
    </details>
  );
}

/**
 * The role dropdown with its explanation beside it: pick a role and the panel
 * below lists exactly what it allows, so nobody has to guess from a job title.
 */
export function RoleChooser({
  roles,
  name = 'roleCode',
  label = 'Role',
  defaultValue = '',
}: {
  roles: readonly RoleDetail[];
  name?: string;
  label?: string;
  defaultValue?: string;
}) {
  const [chosen, setChosen] = useState(defaultValue);
  const role = roles.find((r) => r.code === chosen);
  // Without permission data (the lookup failed, or this person may not see
  // roles) saying "allows nothing" would be wrong, so say nothing instead.
  const explained = roles.some((r) => r.permissions.length > 0);

  return (
    <div className="role-guide field--wide">
      <Select
        label={label}
        name={name}
        required
        wide
        defaultValue={defaultValue}
        hint="What kind of work they do. Where they may do it comes from project membership."
        options={[
          { value: '', label: 'Choose a role…' },
          ...roles.map((r) => ({ value: r.code, label: r.name })),
        ]}
        onChange={setChosen}
      />

      <div className="role-guide__panel" aria-live="polite">
        {!explained ? (
          <p className="muted">
            What each role allows could not be loaded. Pick the role that matches their job; you can
            review it on their page afterwards.
          </p>
        ) : role ? (
          <>
            <p className="role-guide__lead">
              <strong>{role.name}</strong> — {role.description}
            </p>
            <RolePermissions roles={[role]} emptyText="This role does not allow anything yet." />
          </>
        ) : (
          <p className="muted">Choose a role to see exactly what it allows.</p>
        )}
      </div>

      {explained ? <CompareTable roles={roles} /> : null}
    </div>
  );
}
