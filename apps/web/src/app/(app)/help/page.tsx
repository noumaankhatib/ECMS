import { Card, CardBody, CardHead, DetailGroup, DetailItem, PageHead } from '@/components/ui';
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
            <p className="muted u-text-sm" >
              A support request should include the request ID shown on the error you saw, if any —
              it lets whoever looks into it find the exact event in the record.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Common questions" />
          <CardBody>
            <DetailGroup>
              <DetailItem label="A record I need isn&apos;t visible">Visibility follows your role and, for project work, project membership. Ask a
                Project Manager to add you to the project, or a System Administrator to review your
                role.</DetailItem>
              <DetailItem label="An action is refused">The message names what is missing — an unmet precondition (like open issues blocking
                a project close) or a permission you don&apos;t hold. Both are shown, not hidden.</DetailItem>
              <DetailItem label="I need a register as a spreadsheet">Use the &quot;Export CSV&quot; action on the relevant list page.</DetailItem>
            </DetailGroup>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
