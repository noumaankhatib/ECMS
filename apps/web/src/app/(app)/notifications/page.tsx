import type { NotificationItem } from '@ecms/contracts';
import Link from 'next/link';

import { Card, CardBody, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Notifications — ECMS' };

const TYPE_LABEL: Record<NotificationItem['type'], string> = {
  MILESTONE_OVERDUE: 'Milestone overdue',
  ISSUE_OVERDUE: 'Issue overdue',
  SUBMISSION_AWAITING_RESPONSE: 'Awaiting clarification response',
  SUPERVISION_QUOTA_APPROACHING: 'Supervision quota approaching',
  DOCUMENT_MISSING: 'Missing required document',
  HANDOVER_INCOMPLETE: 'Handover incomplete',
};

/**
 * Recomputed on every visit (docs/phase-11-plan.md §5) — nothing here is
 * stored or dismissed, so there is nothing to mark read.
 */
export default async function NotificationsPage() {
  await requireSession();
  const items = await api.get<NotificationItem[]>('/notifications');

  return (
    <>
      <PageHead
        title="Notifications"
        description="Recomputed from the register every time you open this page."
      />

      <Card>
        <CardBody>
          {items.length === 0 ? (
            <Empty title="Nothing needs your attention">
              Every overdue item, missing document and pending response is clear.
            </Empty>
          ) : (
            <ul className="stack">
              {items.map((item, index) => (
                <li key={index} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <span className={`badge badge--${item.severity.toLowerCase()}`}>
                      {TYPE_LABEL[item.type]}
                    </span>
                    <p style={{ margin: 'var(--space-1) 0 0' }}>{item.message}</p>
                  </div>
                  {item.link ? (
                    <Link href={item.link} className="button button--secondary">
                      Open
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
