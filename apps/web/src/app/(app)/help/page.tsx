import { Card, CardBody, CardHead, PageHead } from '@/components/ui';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Help & Support — ECMS' };

export default async function HelpPage() {
  await requireSession();

  return (
    <>
      <PageHead title="Help & Support" description="Where to go when something isn't working." />

      <div className="stack">
        <Card>
          <CardHead title="Getting help" />
          <CardBody>
            <p>
              For anything account- or permission-related, contact whoever administers your
              organisation&apos;s ECMS workspace — the Users &amp; Roles page under Settings shows
              who holds the System Administrator role.
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              A support request should include the request ID shown on the error you saw, if any —
              it lets whoever looks into it find the exact event in the record.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Common questions" />
          <CardBody>
            <dl className="definition">
              <dt>A record I need isn&apos;t visible</dt>
              <dd>
                Visibility follows your role and, for project work, project membership. Ask a
                Project Manager to add you to the project, or a System Administrator to review your
                role.
              </dd>
              <dt>An action is refused</dt>
              <dd>
                The message names what is missing — an unmet precondition (like open issues
                blocking a project close) or a permission you don&apos;t hold. Both are shown, not
                hidden.
              </dd>
              <dt>I need a register as a spreadsheet</dt>
              <dd>Use the &quot;Export CSV&quot; action on the relevant list page.</dd>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
