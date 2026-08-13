import * as React from 'react';
import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentProps } from 'overlayscrollbars-react';
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { cn } from '@ui/lib/utils';

export type ScrollAreaProps = OverlayScrollbarsComponentProps & {
  /** Class applied to the scroll host element (sizing, layout). */
  className?: string;
  /** Class applied to the scroll content wrapper (padding, spacing). */
  contentClassName?: string;
};

const DEFAULT_OPTIONS = {
  scrollbars: {
    theme: 'os-theme-centre-soutien',
    visibility: 'auto',
    autoHide: 'move',
    autoHideDelay: 500,
  },
  overflow: { x: 'hidden', y: 'scroll' },
} as const;

/**
 * Slack-style overlay scrollbars (SOU-216): the thumb floats over the content,
 * so content width never jumps when it appears, and it auto-hides until the
 * pointer moves or the user scrolls. Wraps OverlayScrollbars once in a shared
 * primitive — never per-page. RTL is handled by the lib: under `dir="rtl"` the
 * vertical scrollbar flips to the leading edge automatically.
 *
 * OverlayScrollbars needs an explicit size on the host; pass `className` for
 * sizing (`h-64`, `flex-1 min-h-0`, ...) and `contentClassName` for the
 * padding that should scroll with the content.
 */
export function ScrollArea({ className, contentClassName, children, options, ...rest }: ScrollAreaProps) {
  const mergedOptions = options
    ? { ...DEFAULT_OPTIONS, ...options, scrollbars: { ...DEFAULT_OPTIONS.scrollbars, ...options.scrollbars }, overflow: { ...DEFAULT_OPTIONS.overflow, ...options.overflow } }
    : DEFAULT_OPTIONS;

  return (
    <OverlayScrollbarsComponent
      className={cn('overflow-hidden', className)}
      options={mergedOptions}
      {...rest}
    >
      <div className={cn('h-full', contentClassName)}>{children}</div>
    </OverlayScrollbarsComponent>
  );
}
