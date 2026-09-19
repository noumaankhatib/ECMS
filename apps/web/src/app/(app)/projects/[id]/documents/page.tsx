import Link from 'next/link';

import {
  ActionButton,
  ActionForm,
  CategoryField,
  Field,
  FileField,
  TextArea,
} from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  Empty,
  PageHead,
  Pagination,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Document, DocumentCompleteness, Page as ApiPage, Project } from '@/lib/types';

import { archiveDocument, createDocument } from './actions';

export const metadata = { title: 'Documents — ECMS' };

const PAGE_SIZE = 25;

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
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const pageNumber = Math.max(1, Number(query.page) || 1);

  const [project, documents, completeness] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Document>>(
      `/projects/${id}/documents?page=${pageNumber}&pageSize=${PAGE_SIZE}`,
    ),
    api.get<DocumentCompleteness>(`/projects/${id}/documents/completeness`),
  ]);

  function buildHref(targetPage: number): string {
    return `/projects/${id}/documents?page=${targetPage}`;
  }

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('document:create', id) && !closed;
  const mayArchive = session.can('document:archive', id) && !closed;

  // The Completeness checklist already carries every category this project's
  // required-document scope applies to. Offering exactly those as a dropdown
  // means a category typed here can only ever match by construction, rather
  // than by someone spelling it the same way as the checklist by hand.
  const categoryOptions = [...new Map(completeness.items.map((i) => [i.category, i])).values()].map(
    (item) => ({ value: item.category, label: `${item.category} — ${item.label}` }),
  );

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
                  <Badge
                    key={item.requiredDocumentId}
                    variant={item.satisfied ? 'success-text' : 'critical-text'}
                  >
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
            <div className="table-scroll">
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
                        <Badge>
                          {STATUS_LABEL[document.uploadStatus] ?? document.uploadStatus}
                        </Badge>
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {document.uploadStatus === 'ACTIVE' ? (
                            <a
                              href={`/projects/${id}/documents/${document.id}/content`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="button button--small button--secondary"
                            >
                              View
                            </a>
                          ) : null}
                          {mayArchive && !document.archivedAt ? (
                            <ActionButton
                              action={archiveDocument.bind(null, id, document.id)}
                              label="Archive"
                              variant="danger"
                              confirm={`Archive "${document.title}"? The file is kept, only hidden from this list.`}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {documents.items.length > 0 ? (
            <CardBody>
              <Pagination
                page={pageNumber}
                pageSize={PAGE_SIZE}
                total={documents.total}
                buildHref={buildHref}
              />
            </CardBody>
          ) : null}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createDocument} submitLabel="Upload document">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <CategoryField
                    label="Category"
                    name="category"
                    options={categoryOptions}
                    required
                    hint="Pick one to have this count toward Completeness above, or choose Other for anything else (photos, reports, etc.)."
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
