import Link from 'next/link';

import { ActionForm, Field } from '@/components/form';
import { Breadcrumb, Card, CardBody, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Drawing, Page as ApiPage, Project } from '@/lib/types';

import { createDrawing } from './actions';

export const metadata = { title: 'Drawings — ECMS' };

/**
 * Drawings — a register of stable identities (docs/phase-3-plan.md §5).
 * Everything that changes over a drawing's life belongs to its revisions,
 * shown on the drawing's own detail page, not here.
 */
export default async function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, drawings] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Drawing>>(`/projects/${id}/drawings?pageSize=100`),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('drawing:create', id) && !closed;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Drawings' },
        ]}
      />
      <PageHead title="Drawings" description={project.name} />

      <div className="stack">
        <Card>
          {drawings.items.length === 0 ? (
            <Empty title="No drawings registered yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Current revision</th>
                </tr>
              </thead>
              <tbody>
                {drawings.items.map((drawing) => (
                  <tr key={drawing.id}>
                    <td className="mono">
                      <Link href={`/projects/${id}/drawings/${drawing.id}`}>{drawing.number}</Link>
                    </td>
                    <td>{drawing.title}</td>
                    <td>
                      <Value>{drawing.currentRevisionId ? 'Yes' : null}</Value>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createDrawing} submitLabel="Register drawing">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field label="Drawing number" name="number" required />
                  <Field label="Title" name="title" required />
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
