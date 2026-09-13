import { REQUIRED_DOCUMENT_SCOPES } from '@ecms/contracts';

import { ActionButton, ActionForm, Field, Select } from '@/components/form';
import { Badge, Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { RequiredDocument } from '@/lib/types';

import { archiveRequiredDocument, createRequiredDocument, updateRequiredDocument } from './actions';

export const metadata = { title: 'Required documents — ECMS' };

const SCOPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  ANY: 'Any project',
};

/**
 * The admin-managed checklist behind a project's document completeness
 * (docs/phase-9-plan.md, PRD §16). A small table an administrator can add
 * to, rename, rescope, or retire — nobody edits code to add a category.
 *
 * `GET /required-documents` only ever returns active entries, so a retired
 * one simply stops appearing here and stops being checked for on new
 * completeness reads — it still exists, and a project's own completeness
 * history from before the retirement is unaffected.
 */
export default async function RequiredDocumentsPage() {
  // This page exists only to manage the catalogue, so it sits behind the
  // admin permission itself rather than the weaker `document:view` the
  // underlying GET route also accepts — someone who can only view documents
  // has nothing to do here.
  await requirePermission('required_document:admin');

  const requiredDocuments = await api.get<RequiredDocument[]>('/required-documents');
  const sorted = [...requiredDocuments].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHead
        title="Required documents"
        description="The checklist a project's document completeness is measured against. Retiring one keeps it out of new checks, but does not rewrite a project's past."
      />

      <Card>
        <CardHead title="Active requirements" />
        {sorted.length === 0 ? (
          <Empty title="No required documents">Add the first one below.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Applies to</th>
                <th>Label</th>
                <th>Sort order</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((requiredDocument) => (
                <tr key={requiredDocument.id}>
                  <td className="mono">{requiredDocument.category}</td>
                  <td>
                    <Badge>{SCOPE_LABEL[requiredDocument.scope] ?? requiredDocument.scope}</Badge>
                  </td>
                  <td>
                    <ActionForm action={updateRequiredDocument} submitLabel="Save">
                      <input type="hidden" name="id" value={requiredDocument.id} />
                      <div className="row">
                        <Field
                          label="Label"
                          name="label"
                          id={`label-${requiredDocument.id}`}
                          defaultValue={requiredDocument.label}
                        />
                        <Select
                          label="Applies to"
                          name="scope"
                          id={`scope-${requiredDocument.id}`}
                          defaultValue={requiredDocument.scope}
                          required
                          options={REQUIRED_DOCUMENT_SCOPES.map((scope) => ({
                            value: scope,
                            label: SCOPE_LABEL[scope] ?? scope,
                          }))}
                        />
                        <Field
                          label="Sort order"
                          name="sortOrder"
                          id={`sortOrder-${requiredDocument.id}`}
                          type="number"
                          defaultValue={String(requiredDocument.sortOrder)}
                        />
                      </div>
                    </ActionForm>
                  </td>
                  <td>{requiredDocument.sortOrder}</td>
                  <td className="right">
                    <ActionButton
                      action={archiveRequiredDocument.bind(null, requiredDocument.id)}
                      label="Retire"
                      variant="danger"
                      confirm={`Retire "${requiredDocument.label}"? Projects keep their past completeness history; it just stops being checked for going forward.`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHead title="Add a required document" />
        <CardBody>
          <ActionForm action={createRequiredDocument} submitLabel="Add">
            <div className="form-grid">
              <Field
                label="Category"
                name="category"
                required
                hint="Must match a document's own category exactly, ignoring case and spacing — e.g. Design."
              />
              <Field label="Label" name="label" required hint="What staff see on the checklist." />
              <Select
                label="Applies to"
                name="scope"
                defaultValue="ANY"
                required
                options={REQUIRED_DOCUMENT_SCOPES.map((scope) => ({
                  value: scope,
                  label: SCOPE_LABEL[scope] ?? scope,
                }))}
              />
              <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
