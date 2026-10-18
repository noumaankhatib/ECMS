'use client';

import { useEffect, useRef } from 'react';

export interface AutofillRule {
  /** The `name` of the `EntityCombobox` whose choice drives this. */
  source: string;
  /** The `name` of the input to fill. */
  target: string;
  /** Which value of the chosen option's `meta` to copy. */
  key: string;
}

/** Sets a value the way typing would, so controlled inputs notice it. */
function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Copies details from a picked client/property into other fields of the same
 * form (e.g. owner name from the chosen client). It only ever fills a field
 * that is empty or still holds its own earlier fill, so anything the user typed
 * is never overwritten. Renders nothing.
 */
export function FormAutofill({ rules }: { rules: AutofillRule[] }) {
  const marker = useRef<HTMLSpanElement>(null);
  const lastFilled = useRef(new Map<string, string>());

  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;
    const onSelected = (event: Event): void => {
      const { name, option } = (event as CustomEvent<{
        name: string;
        option: { meta?: Record<string, string> } | null;
      }>).detail;
      for (const rule of rules) {
        if (rule.source !== name) continue;
        const input = form.elements.namedItem(rule.target);
        if (!(input instanceof HTMLInputElement)) continue;
        const previous = lastFilled.current.get(rule.target) ?? '';
        if (input.value !== '' && input.value !== previous) continue;
        const next = option?.meta?.[rule.key] ?? '';
        lastFilled.current.set(rule.target, next);
        setInputValue(input, next);
      }
    };
    form.addEventListener('entity-selected', onSelected);
    return () => form.removeEventListener('entity-selected', onSelected);
  }, [rules]);

  return <span ref={marker} hidden />;
}
