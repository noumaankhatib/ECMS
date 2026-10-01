import Link from 'next/link';

import { CalendarIcon, ChevronDownIcon } from './icons';

export interface SampleField {
  label: string;
  /** An illustrative value — never a real record. */
  example: string;
  required?: boolean;
  /** The real form's own hint text, where it has one. */
  hint?: string;
  kind?: 'text' | 'select' | 'date' | 'textarea';
  wide?: boolean;
}

export interface SampleFormSpec {
  title: string;
  /** Where the real form lives, in words ("Proposals → New proposal"). */
  where: string;
  submitLabel: string;
  fields: SampleField[];
  /** Optional fields left out of the preview, named so nothing is hidden. */
  moreOptional?: string;
  /** The real form — shown only when this person may use it. */
  href?: string | undefined;
}

/**
 * A read-only picture of a real form, filled with example values, for the
 * workflow guide. Deliberately not made of inputs: nothing here can be typed
 * into or submitted, and every preview is badged as sample data so it can
 * never be mistaken for a record.
 */
export function SampleForm({ form }: { form: SampleFormSpec }) {
  return (
    <figure className="sample-form" aria-label={`Example: ${form.title}`}>
      <figcaption className="sample-form__head">
        <div>
          <strong>{form.title}</strong>
          <span>{form.where}</span>
        </div>
        <span className="sample-form__badge">Example values</span>
      </figcaption>

      <dl className="sample-form__grid">
        {form.fields.map((field) => (
          <div
            key={field.label}
            className={`sample-form__field ${field.wide || field.kind === 'textarea' ? 'sample-form__field--wide' : ''}`}
          >
            <dt>
              {field.label}
              {field.required ? (
                <span className="sample-form__required" aria-label="required">
                  *
                </span>
              ) : null}
            </dt>
            <dd>
              <span
                className={`sample-form__value ${field.kind === 'textarea' ? 'sample-form__value--area' : ''}`}
              >
                <span>{field.example}</span>
                {field.kind === 'select' ? <ChevronDownIcon width={14} height={14} /> : null}
                {field.kind === 'date' ? <CalendarIcon width={14} height={14} /> : null}
              </span>
              {field.hint ? <span className="sample-form__hint">{field.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {form.moreOptional ? <p className="sample-form__more">{form.moreOptional}</p> : null}

      <div className="sample-form__foot">
        <span className="button button--small sample-form__submit" aria-hidden="true">
          {form.submitLabel}
        </span>
        {form.href ? (
          <Link href={form.href} className="sample-form__open">
            Open the real form <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </figure>
  );
}
