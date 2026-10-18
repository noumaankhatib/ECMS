import Link from 'next/link';

import { Card, CardBody, CardHead } from '@/components/ui';

export interface NextStep {
  label: string;
  /** Where the form or page for this step lives. Omitted for a step done in place. */
  href?: string;
  detail: string;
}

/** A numbered "do this, then this" list for the moment after a hand-off. */
export function NextSteps({ title = 'Next steps', steps }: { title?: string; steps: NextStep[] }) {
  return (
    <Card>
      <CardHead title={title} />
      <CardBody>
        <ol className="next-steps">
          {steps.map((step) => (
            <li key={step.label}>
              {step.href ? <Link href={step.href}>{step.label}</Link> : <strong>{step.label}</strong>}
              <span className="hint"> — {step.detail}</span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

/** The delivery steps that follow Activate, from the project's type. */
export function deliverySteps(projectId: string, type: string | null): NextStep[] {
  const steps: NextStep[] = [];
  if (type === 'PLANNING' || type === 'BOTH') {
    steps.push({
      label: 'Add a submission',
      href: `/projects/${projectId}/planning`,
      detail: 'Planning → Submissions: reference, authority and department.',
    });
  }
  if (type === 'SUPERVISION' || type === 'BOTH') {
    steps.push({
      label: 'Record the supervision agreement',
      href: `/projects/${projectId}/supervision/agreements`,
      detail: 'Type, visits allowed, amount and start date.',
    });
  }
  return steps;
}
