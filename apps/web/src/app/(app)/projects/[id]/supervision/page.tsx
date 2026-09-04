import Link from 'next/link';

import { ActionForm, Field, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, DateText, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Project, SiteVisit } from '@/lib/types';

import { createSiteVisit } from './actions';

export const metadata = { title: 'Supervision — ECMS' };

/**
 * Supervision — site visits (docs/phase-2-plan.md).
 *
 * A visit is the entry point into observations and instructions, which is
 * why it gets its own detail page while planning's simpler entities do not.
 */
export default async function SupervisionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, visits] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<SiteVisit>>(`/projects/${id}/supervision/site-visits?pageSize=100`),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('supervision:create', id) && !closed;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Supervision' },
        ]}
      />
      <PageHead title="Supervision" description={project.name} />

      <div className="stack">
        <Card>
          {visits.items.length === 0 ? (
            <Empty title="No site visits yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Attendees</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visits.items.map((visit) => (
                  <tr key={visit.id}>
                    <td className="nowrap">
                      <Link href={`/projects/${id}/supervision/${visit.id}`}>
                        <DateText value={visit.visitDate} />
                      </Link>
                    </td>
                    <td>
                      <Value>{visit.attendees}</Value>
                    </td>
                    <td>
                      <Value>{visit.notes}</Value>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createSiteVisit} submitLabel="Record site visit">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field label="Visit date" name="visitDate" type="date" required />
                  <Field label="Attendees" name="attendees" hint="Who was there." />
                </div>
                <TextArea label="Notes" name="notes" />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
