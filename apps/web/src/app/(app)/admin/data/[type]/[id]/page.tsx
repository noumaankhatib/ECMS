import Link from 'next/link';

import { Breadcrumb, Card, CardBody, CardHead, PageHead } from '@/components/ui';
import { requirePermission } from '@/lib/session';

import { fetchImpactTree } from '../../actions';
import { ImpactTreeClient } from './impact-tree-client';

export const metadata = { title: 'Impact tree — ECMS' };

const TYPE_LABELS: Record<string, string> = {
  client: 'Client',
  property: 'Property',
  proposal: 'Proposal',
  project: 'Project',
};

export default async function ImpactTreePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  await requirePermission('admin:data');
  const { type, id } = await params;

  const tree = await fetchImpactTree(type, id);
  const typeLabel = TYPE_LABELS[type] ?? type;

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Data management', href: '/admin/data' },
          { label: typeLabel, href: `/admin/data?tab=${type}s` },
          { label: tree.root.label },
        ]}
      />
      <PageHead
        title={tree.root.label}
        description={`${typeLabel} — impact tree showing all linked records`}
      />

      <div className="summary-banner" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <span className="summary-banner__value">{tree.totalCount}</span>
          <span className="summary-banner__label"> total records linked</span>
        </div>
        <p>
          Select which records to archive (soft delete) or permanently hard-delete. Selecting a
          parent auto-selects all its children.
        </p>
      </div>

      <Card>
        <CardHead title="Linked records">
          <Link href="/admin/data" className="button button--secondary" style={{ fontSize: 13 }}>
            ← Back to browser
          </Link>
        </CardHead>
        <CardBody>
          <ImpactTreeClient tree={tree} type={type} />
        </CardBody>
      </Card>
    </>
  );
}
