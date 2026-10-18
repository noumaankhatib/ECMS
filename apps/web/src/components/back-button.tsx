'use client';

import { useRouter } from 'next/navigation';

/**
 * Goes back one step in the browser's history, which is what a Back button is
 * expected to do — it returns to the exact page (and filters, page number)
 * the person came from. A page opened directly (a bookmark, a pasted link, a
 * new tab) has nothing to go back to, so it falls back to the parent page.
 */
export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="back-button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M10 3 5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
}
