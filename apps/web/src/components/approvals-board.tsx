'use client';

import type { ApprovalInboxEntityType, ApprovalInboxItem } from '@ecms/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card, DateText, Empty } from '@/components/ui';

const TYPE_LABEL: Record<ApprovalInboxEntityType, string> = {
  DrawingRevision: 'Drawing',
  Modification: 'Modification',
  Submission: 'Submission',
  Proposal: 'Proposal',
};
const TYPE_ORDER: ApprovalInboxEntityType[] = [
  'DrawingRevision',
  'Modification',
  'Submission',
  'Proposal',
];
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CLIENT_REVISION: 'With client',
};

type GroupBy = 'project' | 'type' | 'age';
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'project', label: 'By project' },
  { value: 'type', label: 'By type' },
  { value: 'age', label: 'Oldest first' },
];

/** After this many days waiting, an item is called out. */
const STALE_DAYS = 7;
const DAY_MS = 86_400_000;

function daysWaiting(submittedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(submittedAt).getTime()) / DAY_MS));
}

function haystack(item: ApprovalInboxItem): string {
  return [
    item.title,
    TYPE_LABEL[item.entityType],
    item.projectCode,
    item.projectName,
    item.clientName,
    item.submittedByName,
    STATUS_LABEL[item.status] ?? item.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

interface Group {
  key: string;
  title: string;
  subtitle: string | null;
  items: ApprovalInboxItem[];
}

function groupItems(items: ApprovalInboxItem[], by: GroupBy): Group[] {
  if (by === 'age') {
    return [{ key: 'all', title: 'All pending items', subtitle: null, items }];
  }
  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = by === 'type' ? item.entityType : (item.projectCode ?? 'no-project');
    let group = groups.get(key);
    if (!group) {
      group =
        by === 'type'
          ? { key, title: `${TYPE_LABEL[item.entityType]}s`, subtitle: null, items: [] }
          : item.projectCode
            ? {
                key,
                title: `${item.projectCode} · ${item.projectName ?? ''}`,
                subtitle: item.clientName,
                items: [],
              }
            : { key, title: 'Proposals — no project yet', subtitle: null, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  const list = [...groups.values()];
  if (by === 'type') {
    return list.sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.key as ApprovalInboxEntityType) -
        TYPE_ORDER.indexOf(b.key as ApprovalInboxEntityType),
    );
  }
  // Projects alphabetically by code; items with no project go last.
  return list.sort((a, b) =>
    a.key === 'no-project' ? 1 : b.key === 'no-project' ? -1 : a.key.localeCompare(b.key),
  );
}

/**
 * The approvals inbox as a working surface rather than a flat list: search
 * across project, client, submitter and title; narrow by type or project;
 * and group by project (the usual way someone works through sign-offs), by
 * type, or as one oldest-first queue. Filtering is local — the inbox is
 * recomputed on every page load and is small — and the choices are mirrored
 * into the URL so a view can be bookmarked or shared.
 */
export function ApprovalsBoard({ items, now }: { items: ApprovalInboxItem[]; now: number }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ApprovalInboxEntityType | 'ALL'>('ALL');
  const [project, setProject] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const searchRef = useRef<HTMLInputElement>(null);

  // Restore a shared view once, after mount (reading the URL during render
  // would differ between server and browser).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    const t = params.get('type');
    if (t && TYPE_ORDER.includes(t as ApprovalInboxEntityType)) {
      setType(t as ApprovalInboxEntityType);
    }
    setProject(params.get('project') ?? '');
    const g = params.get('group');
    if (g === 'project' || g === 'type' || g === 'age') setGroupBy(g);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'ALL') params.set('type', type);
    if (project) params.set('project', project);
    if (groupBy !== 'project') params.set('group', groupBy);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [query, type, project, groupBy]);

  // "/" jumps to search, unless already typing somewhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.projectCode) seen.set(item.projectCode, `${item.projectCode} · ${item.projectName}`);
    }
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const counts = useMemo(() => {
    const byType = new Map<ApprovalInboxEntityType, number>();
    for (const item of items) byType.set(item.entityType, (byType.get(item.entityType) ?? 0) + 1);
    return byType;
  }, [items]);
  const staleCount = items.filter((i) => daysWaiting(i.submittedAt, now) >= STALE_DAYS).length;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = items.filter(
    (item) =>
      (type === 'ALL' || item.entityType === type) &&
      (!project || item.projectCode === project) &&
      terms.every((term) => haystack(item).includes(term)),
  );
  const groups = groupItems(filtered, groupBy);
  const filtering = query !== '' || type !== 'ALL' || project !== '';

  return (
    <div className="stack">
      <div className="approvals-summary">
        <button
          type="button"
          className={`approvals-chip${type === 'ALL' ? ' approvals-chip--on' : ''}`}
          onClick={() => setType('ALL')}
        >
          All <strong>{items.length}</strong>
        </button>
        {TYPE_ORDER.filter((t) => counts.get(t)).map((t) => (
          <button
            key={t}
            type="button"
            className={`approvals-chip${type === t ? ' approvals-chip--on' : ''}`}
            onClick={() => setType(type === t ? 'ALL' : t)}
          >
            {TYPE_LABEL[t]}s <strong>{counts.get(t)}</strong>
          </button>
        ))}
        {staleCount > 0 ? (
          <span className="approvals-stale" title={`Waiting ${STALE_DAYS} days or more`}>
            {staleCount} waiting {STALE_DAYS}+ days
          </span>
        ) : null}
      </div>

      <div className="approvals-toolbar">
        <div className="approvals-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search project, client, submitter or title…   ( / )"
            aria-label="Search approvals"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          value={project}
          aria-label="Filter by project"
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">All projects</option>
          {projects.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <div className="approvals-seg" role="group" aria-label="Group by">
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={groupBy === option.value}
              className={groupBy === option.value ? 'approvals-seg__on' : undefined}
              onClick={() => setGroupBy(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <Empty title="No matches">
            {filtering ? (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setQuery('');
                  setType('ALL');
                  setProject('');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </Empty>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key}>
            {groupBy === 'age' ? null : (
              <div className="approvals-group__head">
                <div>
                  <h2>{group.title}</h2>
                  {group.subtitle ? <p className="muted">{group.subtitle}</p> : null}
                </div>
                <span className="badge">{group.items.length}</span>
              </div>
            )}
            <table className="approvals-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {groupBy === 'project' ? null : <th>Project</th>}
                  <th>Status</th>
                  <th>Submitted by</th>
                  <th>Submitted</th>
                  <th>Waiting</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const days = daysWaiting(item.submittedAt, now);
                  return (
                    <tr key={`${item.entityType}-${item.id}`}>
                      <td data-label="Item">
                        <span className="approvals-type">{TYPE_LABEL[item.entityType]}</span>
                        <Link href={item.link}>{item.title}</Link>
                      </td>
                      {groupBy === 'project' ? null : (
                        <td data-label="Project">
                          {item.projectCode ? (
                            <>
                              <span className="mono">{item.projectCode}</span>
                              <span className="muted approvals-sub">{item.clientName}</span>
                            </>
                          ) : (
                            <span className="faint">{item.clientName ?? '—'}</span>
                          )}
                        </td>
                      )}
                      <td data-label="Status">
                        <span className="badge">{STATUS_LABEL[item.status] ?? item.status}</span>
                      </td>
                      <td data-label="Submitted by">
                        {item.submittedByName ?? <span className="faint">—</span>}
                      </td>
                      <td data-label="Submitted">
                        <DateText value={item.submittedAt} />
                      </td>
                      <td
                        data-label="Waiting"
                        className={days >= STALE_DAYS ? 'approvals-late' : undefined}
                      >
                        {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
                      </td>
                      <td className="right">
                        <Link href={item.link} className="button button--secondary button--small">
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  );
}
