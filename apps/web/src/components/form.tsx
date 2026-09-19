'use client';

import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';

import type { FormState } from '@/lib/form-state';

import { CalendarIcon } from './icons';

/**
 * Forms.
 *
 * All of them submit to a server action, so they work before JavaScript has
 * loaded and continue to work if it never does. The client component here adds
 * the pending state and the error display on top of a form that was already
 * functional.
 */

export function Field({
  label,
  name,
  id,
  type = 'text',
  defaultValue,
  required,
  hint,
  wide,
  autoComplete,
}: {
  label: string;
  name: string;
  /** Overrides the element's `id` (and its label/hint association) without
   *  changing `name` — needed wherever the same field repeats once per row
   *  (a table of per-row edit forms plus an "Add" form below it), since
   *  `id` must be unique across the whole page even though `name` is scoped
   *  to each row's own `<form>`. Defaults to `name`. */
  id?: string;
  type?: string;
  defaultValue?: string | null | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  autoComplete?: string;
}) {
  const fieldId = id ?? name;
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required ?? false}
        {...(hint ? { 'aria-describedby': `${fieldId}-hint` } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {hint ? (
        <span className="hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A date — typed as day/month/year, or picked from a calendar.
 *
 * A native `<input type="date">` cannot be trusted for the first half of
 * that: which of "05/03" is the day and which is the month is decided by the
 * browser's own locale, not by anything this page can set (the once-common
 * `lang="en-GB"` trick no longer works in current Chrome — confirmed by
 * testing, not assumed). Three explicit boxes read the same way everywhere,
 * for everyone. The calendar itself is real, not a drawn one: the picker
 * button opens the browser's own native date picker (`showPicker()`) on an
 * input kept off-screen for exactly that purpose, and a pick there writes
 * back into the three boxes.
 */
export function DateField({
  label,
  name,
  id,
  defaultValue,
  required,
  hint,
  wide,
  onChange,
}: {
  label: string;
  name: string;
  id?: string;
  /** `yyyy-mm-dd`, or null/undefined for empty — the same shape every page
   *  already normalises API dates to before handing them to a date field. */
  defaultValue?: string | null | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  /** Reports the field's current value (`yyyy-mm-dd`, or `''` while
   *  incomplete) on every change — how `DateRangeFields` knows a start date
   *  to calculate a target date from, without this field needing to know
   *  that a duration calculator exists. */
  onChange?: (iso: string) => void;
}) {
  const fieldId = id ?? name;
  const initial = splitIsoDate(defaultValue);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  const iso = joinIsoDate(day, month, year);

  // `onChange` is always the setter from a parent's `useState` at every call
  // site below, which is stable across renders, so omitting it from the
  // dependency list doesn't risk a stale closure.
  useEffect(() => {
    onChange?.(iso);
  }, [iso]);

  function digitsOnly(raw: string, max: number): string {
    return raw.replace(/\D/g, '').slice(0, max);
  }

  function openCalendar(): void {
    const native = nativeRef.current;
    if (!native) return;
    if (iso) native.value = iso;
    native.showPicker?.();
  }

  function onNativeChange(event: ChangeEvent<HTMLInputElement>): void {
    const parts = splitIsoDate(event.target.value);
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
  }

  /** A full date pasted into any one box fills all three, rather than
   *  mangling itself into whichever box the cursor happened to be in. */
  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const text = event.clipboardData.getData('text');
    const match = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text);
    if (!match) return;
    const [, d, m, y] = match;
    if (!d || !m || !y) return;
    event.preventDefault();
    setDay(d.padStart(2, '0'));
    setMonth(m.padStart(2, '0'));
    setYear(y);
  }

  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={`${fieldId}-day`}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="date-field" {...(hint ? { 'aria-describedby': `${fieldId}-hint` } : {})}>
        <input
          id={`${fieldId}-day`}
          className="date-field__part"
          inputMode="numeric"
          placeholder="DD"
          aria-label="Day"
          maxLength={2}
          value={day}
          required={required ?? false}
          onPaste={onPaste}
          onChange={(event) => {
            const next = digitsOnly(event.target.value, 2);
            setDay(next);
            if (next.length === 2) monthRef.current?.focus();
          }}
        />
        <span className="date-field__sep" aria-hidden="true">
          /
        </span>
        <input
          ref={monthRef}
          className="date-field__part"
          inputMode="numeric"
          placeholder="MM"
          aria-label="Month"
          maxLength={2}
          value={month}
          required={required ?? false}
          onPaste={onPaste}
          onChange={(event) => {
            const next = digitsOnly(event.target.value, 2);
            setMonth(next);
            if (next.length === 2) yearRef.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && month === '') {
              document.getElementById(`${fieldId}-day`)?.focus();
            }
          }}
        />
        <span className="date-field__sep" aria-hidden="true">
          /
        </span>
        <input
          ref={yearRef}
          className="date-field__part date-field__part--year"
          inputMode="numeric"
          placeholder="YYYY"
          aria-label="Year"
          maxLength={4}
          value={year}
          required={required ?? false}
          onPaste={onPaste}
          onChange={(event) => setYear(digitsOnly(event.target.value, 4))}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && year === '') monthRef.current?.focus();
          }}
        />
        <button
          type="button"
          className="date-field__calendar"
          aria-label="Open calendar"
          onClick={openCalendar}
        >
          <CalendarIcon width={16} height={16} />
        </button>
        {/* Off-screen, not `hidden` — a hidden element cannot open its own
            picker. This exists only so `showPicker()` has a native date
            input to call it on; the three boxes above are what the form
            actually reads from and writes to. */}
        <input
          ref={nativeRef}
          type="date"
          className="date-field__native"
          tabIndex={-1}
          aria-hidden="true"
          defaultValue={iso}
          onChange={onNativeChange}
        />
      </div>
      <input type="hidden" name={name} value={iso} />
      {hint ? (
        <span className="hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function splitIsoDate(iso: string | null | undefined): {
  day: string;
  month: string;
  year: string;
} {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const [, year, month, day] = match ?? [];
  return { day: day ?? '', month: month ?? '', year: year ?? '' };
}

function joinIsoDate(day: string, month: string, year: string): string {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';
  return `${year}-${month}-${day}`;
}

const DURATION_UNITS = ['days', 'months', 'years'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
const DURATION_UNIT_LABEL: Record<DurationUnit, string> = {
  days: 'Days',
  months: 'Months',
  years: 'Years',
};

/** Adds a duration to a `yyyy-mm-dd` date. A day 31 days into a month it
 *  doesn't reach (31 Jan + 1 month) clamps to that month's own last day
 *  (28/29 Feb) rather than overflowing into the month after, which is what
 *  plain `Date` arithmetic would otherwise do. */
function addDuration(startIso: string, amount: number, unit: DurationUnit): string {
  const [y, m, d] = startIso.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));

  if (unit === 'days') {
    date.setUTCDate(date.getUTCDate() + amount);
  } else {
    const monthsToAdd = unit === 'years' ? amount * 12 : amount;
    const targetMonthIndex = date.getUTCMonth() + monthsToAdd;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    date.setUTCFullYear(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDayOfTargetMonth));
  }

  return date.toISOString().slice(0, 10);
}

/**
 * A start date and an end date, plus a shortcut for the second: pick a
 * number and a unit (days/months/years) and it's calculated from the start
 * date, rather than counted out by hand against a calendar. Picking a
 * duration only fills the end date in — it stays a normal, editable
 * `DateField` afterward, for the case the calculated date isn't quite right
 * (it should land on the last working day of the month, say).
 */
export function DateRangeFields({
  startLabel,
  startName,
  startDefaultValue,
  startRequired,
  startHint,
  endLabel,
  endName,
  endDefaultValue,
  endRequired,
  endHint,
}: {
  startLabel: string;
  startName: string;
  startDefaultValue?: string | null | undefined;
  startRequired?: boolean;
  startHint?: string;
  endLabel: string;
  endName: string;
  endDefaultValue?: string | null | undefined;
  endRequired?: boolean;
  endHint?: string;
}) {
  const [startIso, setStartIso] = useState(startDefaultValue ?? '');
  const [endValue, setEndValue] = useState(endDefaultValue ?? '');
  // Bumped only when a duration is applied, to force the (otherwise
  // uncontrolled) end DateField to pick up the freshly-calculated value —
  // typing in it directly never touches this, so it stays editable.
  const [endGeneration, setEndGeneration] = useState(0);
  const [durationAmount, setDurationAmount] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days');

  function applyDuration(amountText: string, unit: DurationUnit): void {
    const amount = Number(amountText);
    if (!startIso || !amountText || !Number.isFinite(amount) || amount <= 0) return;
    setEndValue(addDuration(startIso, amount, unit));
    setEndGeneration((g) => g + 1);
  }

  // A duration already set when the start date itself changes (typed,
  // pasted, or picked afterward) recalculates against the new start,
  // instead of silently going stale.
  useEffect(() => {
    if (durationAmount) applyDuration(durationAmount, durationUnit);
  }, [startIso]);

  return (
    <>
      <DateField
        label={startLabel}
        name={startName}
        defaultValue={startDefaultValue}
        required={startRequired ?? false}
        onChange={setStartIso}
        {...(startHint ? { hint: startHint } : {})}
      />
      <DateField
        key={endGeneration}
        label={endLabel}
        name={endName}
        defaultValue={endValue}
        required={endRequired ?? false}
        {...(endHint ? { hint: endHint } : {})}
      />
      <div className="field field--wide">
        <label>Or calculate {endLabel.toLowerCase()} from a duration</label>
        <div className="row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="e.g. 6"
            aria-label="Duration"
            style={{ maxWidth: 90 }}
            value={durationAmount}
            onChange={(event) => {
              setDurationAmount(event.target.value);
              applyDuration(event.target.value, durationUnit);
            }}
          />
          <select
            aria-label="Duration unit"
            style={{ width: 'auto' }}
            value={durationUnit}
            onChange={(event) => {
              const unit = event.target.value as DurationUnit;
              setDurationUnit(unit);
              applyDuration(durationAmount, unit);
            }}
          >
            {DURATION_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {DURATION_UNIT_LABEL[unit]}
              </option>
            ))}
          </select>
          <span className="hint">
            from {startLabel.toLowerCase()} — {endLabel.toLowerCase()} above still stays editable.
          </span>
        </div>
      </div>
    </>
  );
}

/** A real file input. There is exactly one form in this application that
 *  needs one — creating a document — so this stays deliberately plain rather
 *  than growing options nothing else uses. */
export function FileField({
  label,
  name,
  required,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="field field--wide">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input id={name} name={name} type="file" required={required ?? false} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null | undefined;
  hint?: string;
}) {
  return (
    <div className="field field--wide">
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} defaultValue={defaultValue ?? ''} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Select({
  label,
  name,
  id,
  options,
  defaultValue,
  required,
  hint,
  wide,
}: {
  label: string;
  name: string;
  /** See `Field`'s `id` — overrides the element's `id` without changing
   *  `name`, for the same reason: uniqueness across the page when the same
   *  field repeats once per row. Defaults to `name`. */
  id?: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
}) {
  const fieldId = id ?? name;
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={fieldId}
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required ?? false}
      >
        {required ? null : <option value="">—</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

const OTHER = '__other__';

/**
 * A dropdown of known values (e.g. the required-document categories) with an
 * "Other" escape hatch that reveals a free-text input.
 *
 * The underlying field stays free text server-side (there is no fixed enum
 * of document categories — see `createDocumentSchema`), so this is purely a
 * typing aid: pick from the list to match a required-document category
 * exactly, or fall through to "Other" for anything the list doesn't cover.
 */
export function CategoryField({
  label,
  name,
  options,
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | undefined;
  required?: boolean;
  hint?: string;
}) {
  const knownValues = options.map((o) => o.value);
  const startsAsOther = Boolean(defaultValue) && !knownValues.includes(defaultValue as string);
  const [choice, setChoice] = useState(startsAsOther ? OTHER : (defaultValue ?? ''));

  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={name}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        required={required ?? false}
        aria-label={label}
      >
        {/* Always rendered, even when required — a controlled <select> whose
            current value matches no <option> makes the browser silently
            display its first real option while React's own state stays
            empty, so the visible dropdown and what actually gets submitted
            disagree. Keeping this option means "nothing chosen yet" is a
            real, selectable state, and `required` genuinely blocks
            submission until the person picks one on purpose. */}
        <option value="">— Select a category —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {choice === OTHER ? (
        <input
          name={name}
          defaultValue={startsAsOther ? defaultValue : ''}
          placeholder="Type the category"
          required={required ?? false}
          style={{ marginTop: 'var(--space-2)' }}
        />
      ) : (
        <input type="hidden" name={name} value={choice} />
      )}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/**
 * The refusal, shown where the person is looking.
 *
 * `role="alert"` so it is announced rather than merely rendered — someone using
 * a screen reader would otherwise submit the form and hear nothing at all.
 */
export function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;

  return (
    <div className="alert" role="alert">
      {state.error}
      {state.fields && state.fields.length > 0 ? (
        <ul>
          {state.fields.map((field) => (
            <li key={field.field}>{field.reason}</li>
          ))}
        </ul>
      ) : null}
      {state.requestId ? (
        <div className="hint mono" style={{ marginTop: 'var(--space-2)' }}>
          Reference {state.requestId}
        </div>
      ) : null}
    </div>
  );
}

/** Disabled while submitting, so nobody double-creates a record by clicking twice. */
export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button" disabled={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export function CancelLink({ href }: { href: string }) {
  return (
    <Link href={href} className="button button--secondary">
      Cancel
    </Link>
  );
}

/**
 * A form wired to a server action, with its error state.
 *
 * The action returns a FormState rather than throwing, so a refusal from the
 * API becomes something the person can read and correct rather than an error
 * page that loses what they typed.
 */
export function ActionForm({
  action,
  submitLabel,
  cancelHref,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  cancelHref?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="stack">
      <ErrorBanner state={state} />
      {children}
      <div className="form-actions">
        <SubmitButton>{submitLabel}</SubmitButton>
        {cancelHref ? <CancelLink href={cancelHref} /> : null}
      </div>
    </form>
  );
}

/**
 * A single button that performs one action — archive, activate, close.
 *
 * `confirm` is used for the ones that are hard to walk back. It is a browser
 * dialogue rather than a bespoke modal: it cannot be dismissed by accident, it
 * works without JavaScript having hydrated, and nobody has to learn it.
 */
export function ActionButton({
  action,
  label,
  confirm,
  variant = 'secondary',
  hidden,
  disabledReason,
}: {
  action: () => Promise<void>;
  label: string;
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  hidden?: boolean;
  /** Shown as the button's title, and the button is disabled rather than
   *  submitting — the interface hides what someone may never do, but a
   *  precondition they can still go and satisfy is a reason, not a missing
   *  button (docs/phase-10-plan.md §6). */
  disabledReason?: string;
}) {
  if (hidden) return null;

  const className =
    variant === 'primary'
      ? 'button button--small'
      : variant === 'danger'
        ? 'button button--small button--danger'
        : 'button button--small button--secondary';

  if (disabledReason) {
    return (
      <button type="button" className={className} disabled title={disabledReason}>
        {label}
      </button>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm !== undefined && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
