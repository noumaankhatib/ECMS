import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import { CheckIcon } from './icons';
import { Details, type DetailsContent } from './popover';

/**
 * - `next`    — the one step the dashboard is pointing at right now.
 * - `active`  — reached, and work is live or waiting at this step.
 * - `done`    — reached before, nothing waiting.
 * - `locked`  — a prerequisite the forms themselves enforce is not met yet.
 * - `neutral` — this person cannot see the data that would decide any of the above.
 */
export type WorkflowStepState = 'next' | 'active' | 'done' | 'locked' | 'neutral';

export interface WorkflowStep {
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  state: WorkflowStepState;
  /** Overrides the default word for this state ("Waiting", "In progress"). */
  stateLabel?: string | undefined;
  /** The one key count shown on the step itself — real counts only. */
  meta?: string | undefined;
  cta?: { href: string; label: string } | undefined;
  /** Everything secondary: description, prerequisites, related counts, why
   *  it is locked, last update, next action. */
  details: DetailsContent;
}

const STATE_LABEL: Record<WorkflowStepState, string | null> = {
  next: 'Next step',
  active: 'In progress',
  done: 'Done',
  locked: 'Locked',
  neutral: null,
};

/**
 * A picture of the lifecycle the forms already enforce — not a workflow
 * engine. It holds no state and decides nothing; the page passes each step's
 * state in, derived from counts the API already sent.
 */
export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="workflow">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const stateLabel =
          step.state === 'next' ? STATE_LABEL.next : (step.stateLabel ?? STATE_LABEL[step.state]);
        return (
          <Details
            key={step.key}
            as="li"
            className={`workflow__step workflow__step--${step.state}`}
            ariaCurrent={step.state === 'next' ? 'step' : undefined}
            content={step.details}
            triggerLabel={`More about step ${index + 1}: ${step.title}`}
            triggerClassName="workflow__details-trigger"
          >
            <div className="workflow__rail" aria-hidden="true">
              <span className="workflow__marker">
                {step.state === 'done' ? <CheckIcon width={14} height={14} /> : index + 1}
              </span>
              {index < steps.length - 1 ? <span className="workflow__connector" /> : null}
            </div>

            <p className="workflow__eyebrow">
              Step {index + 1}
              {stateLabel ? (
                <span className={`workflow__state workflow__state--${step.state}`}>
                  {stateLabel}
                </span>
              ) : null}
            </p>
            <div className="workflow__title-row">
              <Icon className="workflow__icon" width={16} height={16} />
              <h3 className="workflow__title">{step.title}</h3>
            </div>
            <p className="workflow__meta">{step.meta ?? ' '}</p>
            {step.state !== 'locked' && step.cta ? (
              <Link
                href={step.cta.href}
                className={`button button--small ${step.state === 'next' ? '' : 'button--secondary'} workflow__cta`}
              >
                {step.cta.label} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span />
            )}
          </Details>
        );
      })}
    </ol>
  );
}
