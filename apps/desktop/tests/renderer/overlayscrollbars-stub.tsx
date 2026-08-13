import React from 'react';

/**
 * jsdom overlay-scrollbar stub (SOU-216). OverlayScrollbars measures layout via
 * getComputedStyle, which jsdom cannot resolve — the lib throws on mount. The
 * stub preserves the primitive's React contract: a host element (with the
 * caller's className) containing the children directly. E2E exercises the real
 * lib under Chromium.
 */
export function OverlayScrollbarsComponent({
  children,
  className,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className} data-overlayscrollbars="mock" {...props}>
      {children}
    </div>
  );
}

export function useOverlayScrollbars() {
  return [() => {}, () => null] as const;
}
