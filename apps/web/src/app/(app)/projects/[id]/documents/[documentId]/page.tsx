import { ActionForm, Field, TextArea } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  Empty,
  PageHead,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Document, Project } from '@/lib/types';

import { updateDocument } from '../actions';

export const metadata = { title: 'Document — ECMS' };

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Uploading',
  ACTIVE: 'Available',
  FAILED: 'Upload failed',
};

/** Mirrors the API's own `isInlineViewable` (documents.controller.ts) — a
 *  browser can render these on its own, so they get a real preview here
 *  instead of a link to click through to. */
function isInlineViewable(mimeType: string | null): boolean {
  return mimeType === 'application/pdf' || (mimeType?.startsWith('image/') ?? false);
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const session = await requireSession();
  const { id, documentId } = await params;

  const [project, document] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<Document>(`/projects/${id}/documents/${documentId}`),
  ]);

  const closed = project.status === 'CLOSED';
  const mayEdit = session.can('document:edit', id) && !closed && !document.archivedAt;
  const previewable = document.uploadStatus === 'ACTIVE' && isInlineViewable(document.mimeType);
  const contentUrl = `/projects/${id}/documents/${documentId}/content`;
  const hasLeftColumn = mayEdit || previewable;

  const details = (
    <Card>
      <CardHead title="Details" />
      <CardBody>
        <dl className="definition">
          <dt>Category</dt>
          <dd>{document.category}</dd>
          <dt>File</dt>
          <dd>
            {document.uploadStatus === 'ACTIVE' ? (
              // PDFs/images render inline (API sets Content-Disposition
              // accordingly) — opened in a new tab so viewing one never
              // navigates away from this page. Anything else the browser
              // can't render still downloads as normal.
              <a href={contentUrl} target="_blank" rel="noopener noreferrer">
                {document.originalFilename ?? 'View'}
              </a>
            ) : (
              <Value>{null}</Value>
            )}
          </dd>
          {document.archivedAt ? (
            <>
              <dt>Archived</dt>
              <dd>This document is archived. The file is kept, only hidden from ordinary lists.</dd>
            </>
          ) : null}
          {document.description ? (
            <>
              <dt>Description</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{document.description}</dd>
            </>
          ) : null}
        </dl>
      </CardBody>
    </Card>
  );

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/documents`, label: 'Documents' },
          { label: document.title },
        ]}
      />
      <PageHead title={document.title} description={project.name}>
        <Badge>{STATUS_LABEL[document.uploadStatus] ?? document.uploadStatus}</Badge>
      </PageHead>

      {hasLeftColumn ? (
        <div className="grid-2">
          <div className="stack">
            {previewable ? (
              <Card>
                <CardHead title="Preview" />
                <CardBody>
                  {document.mimeType === 'application/pdf' ? (
                    <iframe src={contentUrl} className="doc-preview" title={document.title} />
                  ) : (
                    // A proxied API route, not a static/optimizable Next
                    // asset — next/image cannot serve this.
                    <img src={contentUrl} alt={document.title} className="doc-preview-image" />
                  )}
                </CardBody>
              </Card>
            ) : null}

            {mayEdit ? (
              <Card>
                <CardHead title="Edit" />
                <CardBody>
                  <ActionForm action={updateDocument} submitLabel="Save changes">
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="id" value={documentId} />
                    <input type="hidden" name="version" value={document.version} />
                    <div className="form-grid">
                      <Field
                        label="Category"
                        name="category"
                        required
                        defaultValue={document.category}
                      />
                      <Field label="Title" name="title" required defaultValue={document.title} />
                    </div>
                    <TextArea
                      label="Description"
                      name="description"
                      defaultValue={document.description}
                    />
                  </ActionForm>
                </CardBody>
              </Card>
            ) : null}
          </div>

          {details}
        </div>
      ) : (
        <div className="stack" style={{ maxWidth: 480 }}>
          {document.uploadStatus !== 'ACTIVE' ? (
            <Card>
              <CardBody>
                <Empty title="No preview available">
                  {document.uploadStatus === 'PENDING'
                    ? 'Still uploading — check back shortly.'
                    : 'The upload failed, so there is no file to preview.'}
                </Empty>
              </CardBody>
            </Card>
          ) : null}
          {details}
        </div>
      )}
    </>
  );
}
