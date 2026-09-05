import { ActionForm, Field, TextArea } from '@/components/form';
import { Badge, Breadcrumb, Card, CardBody, CardHead, PageHead, Value } from '@/components/ui';
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

      <div className="grid-2">
        <div className="stack">
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

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Category</dt>
              <dd>{document.category}</dd>
              <dt>File</dt>
              <dd>
                {document.uploadStatus === 'ACTIVE' ? (
                  <a href={`/projects/${id}/documents/${documentId}/content`}>
                    {document.originalFilename ?? 'Download'}
                  </a>
                ) : (
                  <Value>{null}</Value>
                )}
              </dd>
              {document.archivedAt ? (
                <>
                  <dt>Archived</dt>
                  <dd>
                    This document is archived. The file is kept, only hidden from ordinary lists.
                  </dd>
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
      </div>
    </>
  );
}
