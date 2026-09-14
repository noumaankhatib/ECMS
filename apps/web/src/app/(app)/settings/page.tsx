import Link from 'next/link';

import { Card, CardBody, CardHead, PageHead } from '@/components/ui';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Settings — ECMS' };

/**
 * A hub for the administration this application already has, not a new
 * feature — this repo has no per-account preference or system-config store
 * to surface, so this page links to the real admin surfaces (users, sketch
 * types, required documents) rather than fabricating toggles that would do
 * nothing.
 */
export default async function SettingsPage() {
  const session = await requireSession();

  const items = [
    {
      href: '/users',
      title: 'Users & roles',
      description: 'Who has access, and what each role can do.',
      show: session.can('user:view'),
    },
    {
      href: '/sketch-types',
      title: 'Sketch types',
      description: 'The catalogue of proposal sketch types.',
      show: session.can('sketch_type:admin'),
    },
    {
      href: '/required-documents',
      title: 'Required documents',
      description: 'The checklist a project is measured against for completeness.',
      show: session.can('required_document:admin'),
    },
  ].filter((item) => item.show);

  return (
    <>
      <PageHead title="Settings" description="Administration for this workspace." />

      <div className="stack">
        <Card>
          <CardHead title="Your account" />
          <CardBody>
            <dl className="definition">
              <dt>Name</dt>
              <dd>{session.user.displayName}</dd>
              <dt>Email</dt>
              <dd>{session.user.email}</dd>
            </dl>
          </CardBody>
        </Card>

        {items.length > 0 ? (
          <Card>
            <CardHead title="Administration" />
            <CardBody>
              <ul className="stack">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} style={{ fontWeight: 500 }}>
                      {item.title}
                    </Link>
                    <p className="muted" style={{ margin: 'var(--space-1) 0 0', fontSize: 13 }}>
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
