import type { ApprovalInboxEntityType, ApprovalInboxItem } from '@ecms/contracts';
import Link from 'next/link';

import { Card, CardBody, CardHead, DateText, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Approvals — ECMS' };

const SECTION_TITLE: Record<ApprovalInboxEntityType, string> = {
  DrawingRevision: 'Drawings',
  Modification: 'Modifications',
  Submission: 'Submissions',
  Proposal: 'Proposals',
};

const SECTION_ORDER: ApprovalInboxEntityType[] = [
  'DrawingRevision',
  'Modification',
  'Submission',
  'Proposal',
];

/**
 * A single landing spot for everything pending this user's approval,
 * unioned across the three modules that share `ApprovalStatus`
 * (drawings/modifications/submissions) plus proposals' own separate
 * approval step (`GET /insights/approvals`). Read-only: each row links
 * straight to the entity's existing approve/reject screen rather than
 * duplicating that action here.
 */
export default async function ApprovalsPage() {
  await requireSession();
  const items = await api.get<ApprovalInboxItem[]>('/insights/approvals');

  const bySection = SECTION_ORDER.map((entityType) => ({
    entityType,
    items: items.filter((item) => item.entityType === entityType),
  }));

  return (
    <>
      <PageHead
        title="Approvals"
        description="Everything waiting on your sign-off, recomputed every time you open this page."
      />

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <Empty title="Nothing is waiting on you">
              Every drawing, modification, submission and proposal you can approve is clear.
            </Empty>
          </CardBody>
        </Card>
      ) : (
        <div className="stack">
          {bySection
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <Card key={section.entityType}>
                <CardHead title={`${SECTION_TITLE[section.entityType]} (${section.items.length})`} />
                <CardBody>
                  <ul className="stack scroll-list">
                    {section.items.map((item) => (
                      <li
                        key={`${item.entityType}-${item.id}`}
                        className="row"
                        style={{ justifyContent: 'space-between' }}
                      >
                        <div>
                          <p style={{ margin: 0 }}>{item.title}</p>
                          <p className="muted" style={{ margin: 0 }}>
                            Submitted <DateText value={item.submittedAt} />
                          </p>
                        </div>
                        <Link href={item.link} className="button button--secondary">
                          Review
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
