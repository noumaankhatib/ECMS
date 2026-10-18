import { ActionForm } from '@/components/form';
import type { FormState } from '@/lib/form-state';

/**
 * The standard items an administrator keeps on the Planning templates page, as
 * a tick-list. Items the project already has are left out, so nothing can be
 * added twice. Everything starts ticked; untick what does not apply.
 */
export function TemplateChecklist({
  projectId,
  kind,
  title,
  items,
  existing,
  action,
}: {
  projectId: string;
  kind: 'ACTIVITY' | 'MILESTONE';
  title: string;
  items: readonly string[];
  existing: readonly string[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const have = new Set(existing.map((name) => name.trim().toLowerCase()));
  const remaining = items.filter((name) => !have.has(name.trim().toLowerCase()));
  if (remaining.length === 0) return null;

  return (
    <details className="template-checklist">
      <summary>
        {title} <span className="faint">({remaining.length} not added yet)</span>
      </summary>
      <ActionForm action={action} submitLabel="Add selected">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="kind" value={kind} />
        <ul className="template-checklist__list">
          {remaining.map((name) => (
            <li key={name}>
              <label>
                <input type="checkbox" name="item" value={name} defaultChecked /> {name}
              </label>
            </li>
          ))}
        </ul>
      </ActionForm>
    </details>
  );
}
