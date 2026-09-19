'use client';

import type { SearchResult, SearchResultType } from '@ecms/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { CloseIcon, SearchIcon } from './icons';

const TYPE_LABEL: Record<SearchResultType, string> = {
  CLIENT: 'Client',
  PROPERTY: 'Property',
  PROJECT: 'Project',
  PROPOSAL: 'Proposal',
};

const RESULT_HREF: Record<SearchResultType, (id: string) => string> = {
  CLIENT: (id) => `/clients/${id}`,
  PROPERTY: (id) => `/properties/${id}`,
  PROJECT: (id) => `/projects/${id}`,
  PROPOSAL: (id) => `/proposals/${id}`,
};

/**
 * The ⌘K / Ctrl+K command palette — a faster way into the same search the
 * `/search` page already offers (docs/phase-11-plan.md §6), not a second
 * search implementation. It calls `/api/search`, a thin JSON twin of that
 * page's own `GET /search?q=` request, and "see all results" simply lands
 * on `/search?q=...` — the full page keeps working exactly as it did.
 *
 * Open state is owned by the caller (the header) so both the keyboard
 * shortcut and a click on the header's search field can trigger the same
 * instance.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || query.trim().length === 0) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => (res.ok ? (res.json() as Promise<SearchResult[]>) : []))
        .then((items) => setResults(items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  const trimmed = query.trim();

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette__input-row">
          <SearchIcon className="command-palette__icon" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, clients, proposals, properties..."
            aria-label="Search"
          />
          <button
            type="button"
            className="command-palette__close"
            onClick={onClose}
            aria-label="Close search"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        <div className="command-palette__body">
          {trimmed.length === 0 ? (
            <p className="command-palette__hint">
              Type to search every register you can view — or press{' '}
              <kbd>Esc</kbd> to close.
            </p>
          ) : loading ? (
            <p className="command-palette__hint">Searching...</p>
          ) : results.length === 0 ? (
            <p className="command-palette__hint">No matches for &quot;{trimmed}&quot;.</p>
          ) : (
            <ul className="command-palette__results">
              {results.slice(0, 8).map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link href={RESULT_HREF[item.type](item.id)} onClick={onClose}>
                    <span className="command-palette__result-type">{TYPE_LABEL[item.type]}</span>
                    <span className="command-palette__result-label">{item.label}</span>
                    {item.sublabel ? (
                      <span className="command-palette__result-sub">{item.sublabel}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {trimmed.length > 0 ? (
          <div className="command-palette__footer">
            <Link href={`/search?q=${encodeURIComponent(trimmed)}`} onClick={onClose}>
              See all results for &quot;{trimmed}&quot;
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
