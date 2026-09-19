'use client';

import { useEffect } from 'react';

import { Card, CardBody, PageHead } from '@/components/ui';

/**
 * Catches any error thrown while rendering a page inside the authenticated
 * app shell — a failed API call, a bad response shape, or (as happened once)
 * a stray browser/runtime error unrelated to this application's own code —
 * and shows a plain, on-brand message instead of Next's raw dev overlay or a
 * blank white screen in production.
 *
 * This is the difference between "it broke" and "it told you what to do
 * next": the sidebar and header (from the layout above this boundary) stay
 * up, so the person can still navigate away, and `reset()` retries the
 * render in place without a full page reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No client-side logging sink wired up yet; this keeps the detail out of
    // the UI while it stays visible to whoever is looking at devtools.
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHead title="Something went wrong" />
      <Card>
        <CardBody>
          <div className="alert" role="alert">
            <p>
              This page hit an error and could not finish loading. Nothing you did caused this —
              it is safe to try again.
            </p>
            {error.digest ? (
              <p className="hint">
                Reference: <code>{error.digest}</code> — include this if you report the problem.
              </p>
            ) : null}
          </div>
          <div className="row" style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="button" onClick={() => reset()}>
              Try again
            </button>
            <a href="/dashboard" className="button button--secondary">
              Back to dashboard
            </a>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
