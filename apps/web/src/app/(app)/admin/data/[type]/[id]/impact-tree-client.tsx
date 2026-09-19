'use client';

import type { AdminDeleteItem, AdminEntityType, ImpactNode, ImpactTree } from '@ecms/contracts';
import { useTransition, useState, useCallback } from 'react';

import { archiveItems, hardDeleteItems } from '../../actions';

function allIds(node: ImpactNode): { type: AdminEntityType; id: string }[] {
  return [{ type: node.type, id: node.id }, ...node.children.flatMap(allIds)];
}

const TYPE_LABELS: Record<AdminEntityType, string> = {
  client: 'Client',
  contact: 'Contact',
  property: 'Property',
  proposal: 'Proposal',
  project: 'Project',
  member: 'Member',
  workstream: 'Workstream',
  planningActivity: 'Planning activity',
  milestone: 'Milestone',
  submission: 'Submission',
  submissionReview: 'Submission review',
  submissionMeeting: 'Submission meeting',
  siteVisit: 'Site visit',
  observation: 'Observation',
  instruction: 'Instruction',
  issue: 'Issue',
  supervisionAgreement: 'Supervision agreement',
  drawing: 'Drawing',
  drawingRevision: 'Drawing revision',
  modification: 'Modification',
  document: 'Document',
  handoverChecklist: 'Handover checklist',
};

const ARCHIVABLE_TYPES: Set<AdminEntityType> = new Set([
  'client', 'contact', 'property', 'planningActivity', 'milestone', 'document',
]);

interface TreeNodeProps {
  node: ImpactNode;
  selected: Set<string>;
  onToggle: (node: ImpactNode, checked: boolean) => void;
  depth: number;
}

function TreeNode({ node, selected, onToggle, depth }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selected.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggle(node, e.target.checked)}
          style={{ width: 'auto', flexShrink: 0 }}
        />
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--color-muted, #6b7280)', width: 16 }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 12,
            padding: '2px 6px',
            background: 'var(--color-surface, #f3f4f6)',
            borderRadius: 4,
            color: 'var(--color-muted, #6b7280)',
            flexShrink: 0,
          }}
        >
          {TYPE_LABELS[node.type] ?? node.type}
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: depth === 0 ? 600 : 400 }}>
          {node.label}
        </span>
        {node.archivedAt ? (
          <span className="badge" style={{ fontSize: 11 }}>Archived</span>
        ) : null}
        {hasChildren ? (
          <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
            {node.children.length} {node.children.length === 1 ? 'child' : 'children'}
          </span>
        ) : null}
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConfirmDialogProps {
  count: number;
  rootLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  pending: boolean;
}

function ConfirmDialog({ count, rootLabel, onConfirm, onCancel, pending }: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-raised, #fff)',
          borderRadius: 8,
          padding: 32,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ marginTop: 0, color: 'var(--color-danger, #c0392b)' }}>Permanent deletion</h2>
        <p>
          This will <strong>permanently delete {count} record{count !== 1 ? 's' : ''}</strong>. This
          cannot be undone.
        </p>
        <p>
          Type <strong>{rootLabel}</strong> to confirm:
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={rootLabel}
          autoFocus
          style={{ width: '100%', marginBottom: 16 }}
        />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="button button--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={typed.trim() !== rootLabel.trim() || pending}
            onClick={() => onConfirm(typed)}
          >
            {pending ? 'Deleting…' : `Delete ${count} record${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImpactTreeClient({ tree }: { tree: ImpactTree; type: string }) {
  const allNodes = allIds(tree.root);
  const [selected, setSelected] = useState<Set<string>>(new Set(allNodes.map((n) => n.id)));
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = useCallback((node: ImpactNode, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = allIds(node);
      if (checked) {
        ids.forEach((n) => next.add(n.id));
      } else {
        ids.forEach((n) => next.delete(n.id));
      }
      return next;
    });
  }, []);

  function selectAll() {
    setSelected(new Set(allNodes.map((n) => n.id)));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  const selectedItems: AdminDeleteItem[] = allNodes
    .filter((n) => selected.has(n.id))
    .map((n) => ({ type: n.type, id: n.id }));

  const allArchivable = selectedItems.every((i) => ARCHIVABLE_TYPES.has(i.type));

  function handleArchive() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await archiveItems(selectedItems);
      if (result.error) setError(result.error);
      else setSuccess(`${selectedItems.length} record${selectedItems.length !== 1 ? 's' : ''} archived.`);
    });
  }

  function handleHardDeleteConfirm(name: string) {
    setError(null);
    startTransition(async () => {
      const result = await hardDeleteItems(selectedItems, name);
      if (result?.error) {
        setError(result.error);
        setShowConfirm(false);
      }
    });
  }

  return (
    <div>
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="button button--secondary" onClick={selectAll} style={{ fontSize: 13 }}>
            Select all
          </button>
          <button type="button" className="button button--secondary" onClick={deselectAll} style={{ fontSize: 13 }}>
            Deselect all
          </button>
        </div>
        <span style={{ fontSize: 14 }}>
          <strong>{selected.size}</strong> of <strong>{tree.totalCount}</strong> records selected
        </span>
      </div>

      <div
        style={{
          border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 8,
          padding: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          maxHeight: 520,
          overflowY: 'auto',
        }}
      >
        <TreeNode node={tree.root} selected={selected} onToggle={toggle} depth={0} />
      </div>

      {error ? (
        <div
          style={{
            padding: 'var(--space-3)',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 6,
            color: '#991b1b',
            marginBottom: 'var(--space-3)',
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            padding: 'var(--space-3)',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 6,
            color: '#166534',
            marginBottom: 'var(--space-3)',
          }}
        >
          {success}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          paddingTop: 'var(--space-3)',
          borderTop: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        <button
          type="button"
          className="button button--secondary"
          disabled={selectedItems.length === 0 || !allArchivable || isPending}
          onClick={handleArchive}
          title={!allArchivable ? 'Some selected types cannot be archived — use hard delete' : undefined}
        >
          {isPending ? 'Working…' : `Archive selected (${selectedItems.length})`}
        </button>
        <button
          type="button"
          className="button button--danger"
          disabled={selectedItems.length === 0 || isPending}
          onClick={() => setShowConfirm(true)}
        >
          Hard delete selected ({selectedItems.length})
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          count={selectedItems.length}
          rootLabel={tree.root.label}
          onConfirm={handleHardDeleteConfirm}
          onCancel={() => setShowConfirm(false)}
          pending={isPending}
        />
      )}
    </div>
  );
}
