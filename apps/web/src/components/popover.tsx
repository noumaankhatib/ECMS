'use client';

import Link from 'next/link';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { CloseIcon, InfoIcon } from './icons';

/** Plain data, so a server component can hand it across the boundary. */
export interface DetailsContent {
  title: string;
  description?: string | undefined;
  rows?: { label: string; value: string; tone?: 'danger' | 'success' | undefined }[] | undefined;
  notes?: { label: string; text: string }[] | undefined;
  link?: { href: string; label: string } | undefined;
}

const SHEET_QUERY = '(max-width: 700px)';
const OPEN_DELAY = 300;
const CLOSE_DELAY = 150;
const GAP = 8;

/**
 * Progressive disclosure for the dashboard: the essentials stay on the card,
 * the secondary detail lives here.
 *
 * - Desktop: hovering the region opens a compact popover beside it; a click
 *   on the trigger pins it open until the pointer clicks elsewhere.
 * - Keyboard: the trigger is a real button — Enter/Space opens, Esc closes
 *   and returns focus, Tab continues into the popover (it stays in DOM
 *   order right after the trigger).
 * - Narrow screens: a tap opens the same content as a bottom sheet.
 *
 * The panel is `position: fixed`, so a scrolling ancestor (the workflow row)
 * cannot clip it. Nothing essential may live only in here — primary actions
 * and critical numbers stay on the card itself.
 */
export function Details({
  content,
  children,
  as: Tag = 'div',
  className = '',
  trigger = 'icon',
  triggerLabel,
  triggerClassName = '',
  ariaCurrent,
}: {
  content: DetailsContent;
  children: ReactNode;
  as?: 'div' | 'li';
  className?: string;
  /** `icon` — a small info button beside the content (the region itself
   *  may hold other links). `area` — the content itself is the button. */
  trigger?: 'icon' | 'area';
  triggerLabel?: string;
  triggerClassName?: string;
  ariaCurrent?: 'step' | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const wrapRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const id = useId();
  const panelId = `${id}-details`;
  const titleId = `${id}-details-title`;

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };

  const show = (pin: boolean) => {
    clearTimers();
    if (!open) {
      setSheet(window.matchMedia(SHEET_QUERY).matches);
      setPos(null);
      setOpen(true);
    }
    setPinned(pin);
  };

  const hide = useCallback((restoreFocus = false) => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (!wrap || !panel) return;
    const anchor = wrap.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - GAP && anchor.top - GAP - height >= GAP) {
      top = anchor.top - GAP - height;
    }
    const left = Math.max(GAP, Math.min(anchor.left, window.innerWidth - width - GAP));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open && !sheet) place();
  }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) hide();
    };
    const onMove = () => {
      if (!sheet) place();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, sheet, place, hide]);

  // A bottom sheet covers the page, so focus goes into it.
  useEffect(() => {
    if (open && sheet) {
      panelRef.current?.querySelector<HTMLElement>('.details-panel__close')?.focus();
    }
  }, [open, sheet]);

  useEffect(() => () => clearTimers(), []);

  const onTriggerClick = () => {
    if (!open) show(true);
    else if (!pinned && !sheet) setPinned(true);
    else hide();
  };

  const triggerProps = {
    ref: triggerRef,
    type: 'button' as const,
    onClick: onTriggerClick,
    'aria-expanded': open,
    'aria-haspopup': 'dialog' as const,
    ...(open ? { 'aria-controls': panelId } : {}),
  };

  return (
    <Tag
      ref={wrapRef as never}
      className={`details ${open ? 'details--open' : ''} ${className}`}
      {...(ariaCurrent ? { 'aria-current': ariaCurrent } : {})}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        window.clearTimeout(closeTimer.current);
        if (!open) openTimer.current = window.setTimeout(() => show(false), OPEN_DELAY);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        window.clearTimeout(openTimer.current);
        if (open && !pinned && !sheet) {
          closeTimer.current = window.setTimeout(() => hide(), CLOSE_DELAY);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !wrapRef.current?.contains(next)) hide();
      }}
    >
      {trigger === 'area' ? (
        <button {...triggerProps} className={`details-area ${triggerClassName}`}>
          {children}
        </button>
      ) : (
        <>
          {children}
          <button
            {...triggerProps}
            className={`details-trigger ${triggerClassName}`}
            aria-label={triggerLabel ?? `More about ${content.title}`}
          >
            <InfoIcon width={14} height={14} />
          </button>
        </>
      )}

      {open && sheet ? (
        <div className="details-backdrop" aria-hidden="true" onClick={() => hide(true)} />
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className={`details-panel ${sheet ? 'details-panel--sheet' : ''}`}
          style={
            sheet
              ? undefined
              : pos
                ? { top: pos.top, left: pos.left }
                : { top: 0, left: 0, visibility: 'hidden' }
          }
        >
          <div className="details-panel__head">
            <strong id={titleId}>{content.title}</strong>
            {sheet ? (
              <button
                type="button"
                className="details-panel__close"
                aria-label="Close details"
                onClick={() => hide(true)}
              >
                <CloseIcon width={16} height={16} />
              </button>
            ) : null}
          </div>
          {content.description ? (
            <p className="details-panel__description">{content.description}</p>
          ) : null}
          {content.rows && content.rows.length > 0 ? (
            <dl className="details-panel__rows">
              {content.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className={row.tone ? `details-panel__value--${row.tone}` : ''}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {content.notes?.map((note) => (
            <div key={note.label} className="details-panel__note">
              <span>{note.label}</span>
              <p>{note.text}</p>
            </div>
          ))}
          {content.link ? (
            <Link href={content.link.href} className="details-panel__link" onClick={() => hide()}>
              {content.link.label} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </Tag>
  );
}
