import type { ApprovalInboxItem } from '@ecms/contracts';

import { ApprovalsBoard } from '@/components/approvals-board';
import { Card, CardBody, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Approvals — ECMS' };

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
        <ApprovalsBoard items={items} now={Date.now()} />
      )}
    </>
  );
}
