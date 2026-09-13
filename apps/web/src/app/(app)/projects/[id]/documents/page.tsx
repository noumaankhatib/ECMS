import Link from 'next/link';

import { ActionButton, ActionForm, Field, FileField, TextArea } from '@/components/form';
import { Badge, Breadcrumb, Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Document, DocumentCompleteness, Page as ApiPage, Project } from '@/lib/types';

import { archiveDocument, createDocument } from './actions';

export const metadata = { title: 'Documents — ECMS' };

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Uploading',
  ACTIVE: 'Available',
  FAILED: 'Upload failed',
};

/**
 * The document register (PRD §6, "Document Management"). Bytes go to Google
 * Shared Drive; this database only ever holds the metadata
 * (docs/phase-3-plan.md §7) — a document created here is written and marked
 * ACTIVE by the API before this page ever sees it.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, documents, completeness] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Document>>(`/projects/${id}/documents?pageSize=100`),
    api.get<DocumentCompleteness>(`/projects/${id}/documents/completeness`),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('document:create', id) && !closed;
  const mayArchive = session.can('document:archive', id) && !closed;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Documents' },
        ]}
      />
      <PageHead title="Documents" description={project.name} />

      <div className="stack">
        {completeness.items.length > 0 ? (
          <Card>
            <CardHead title="Completeness" />
            <CardBody>
              <p className="hint">
                {completeness.missingCount === 0
                  ? 'Every required document has been uploaded.'
                  : `${completeness.missingCount} required document${completeness.missingCount === 1 ? '' : 's'} missing.`}
              </p>
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                {completeness.items.map((item) => (
                  <Badge key={item.requiredDocumentId}>
                    {item.satisfied ? '✓' : '✗'} {item.label}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          {documents.items.length === 0 ? (
            <Empty title="No documents registered yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.items.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <Link href={`/projects/${id}/documents/${document.id}`}>
                        {document.title}
                      </Link>
                    </td>
                    <td>{document.category}</td>
                    <td>
                      <Badge>{STATUS_LABEL[document.uploadStatus] ?? document.uploadStatus}</Badge>
                    </td>
                    <td className="right">
                      {mayArchive && !document.archivedAt ? (
                        <ActionButton
                          action={archiveDocument.bind(null, id, document.id)}
                          label="Archive"
                          variant="danger"
                          confirm={`Archive "${document.title}"? The file is kept, only hidden from this list.`}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createDocument} submitLabel="Upload document">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field
                    label="Category"
                    name="category"
                    required
                    hint="Report, drawing, photograph… Match a required-document category (see Completeness above) to have this count toward it."
                  />
                  <Field label="Title" name="title" required />
                </div>
                <TextArea label="Description" name="description" />
                <FileField label="File" name="file" required />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
