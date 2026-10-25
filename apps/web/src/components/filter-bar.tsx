'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from 'react';

/** How long typing must pause before the list updates. */
const TYPING_PAUSE_MS = 350;

/**
 * The search and filter row above a list. The inputs are passed in, so each page
 * keeps its own fields; this only decides when the list updates.
 *
 * - Typing in the search box updates the list once typing pauses.
 * - Changing a select or tick box updates it at once.
 * - Enter or the Search button updates it at once.
 *
 * The URL is the state, so the result can be bookmarked and the back button
 * works. It stays a plain GET form, so it still works without JavaScript.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const [pending, startTransition] = useTransition();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(): void {
    if (timer.current) clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;

    const query = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim() !== '') query.set(name, value.trim());
    }
    // A new search starts on the first page.
    query.delete('page');

    const qs = query.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    apply();
  }

  function onInput(event: FormEvent<HTMLFormElement>): void {
    const target = event.target as HTMLInputElement;
    if (target.type !== 'search' || composing.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, TYPING_PAUSE_MS);
  }

  function onChange(event: FormEvent<HTMLFormElement>): void {
    const target = event.target as HTMLInputElement;
    // The search box is handled by onInput; everything else applies straight away.
    if (target.type !== 'search') apply();
  }

  return (
    <form
      ref={formRef}
      className="filter-bar"
      method="get"
      aria-busy={pending}
      onSubmit={onSubmit}
      onInput={onInput}
      onChange={onChange}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(apply, TYPING_PAUSE_MS);
      }}
    >
      {children}
    </form>
  );
}
