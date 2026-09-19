'use client';

/**
 * The last-resort boundary — catches an error thrown above `(app)/error.tsx`
 * (the root layout itself, or a route outside the authenticated shell, e.g.
 * `/login`). Next requires this file to render its own `<html>`/`<body>`,
 * since the root layout that would normally provide them is exactly what may
 * have failed.
 *
 * Deliberately minimal and inline-styled: this is the one screen in the
 * application that cannot assume its own stylesheet, fonts, or component
 * library loaded successfully.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 560 }}>
        <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
        <p>The application failed to load. This is not something you caused — try again.</p>
        {error.digest ? (
          <p style={{ color: '#666', fontSize: '0.875rem' }}>
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            border: '1px solid #ccc',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
