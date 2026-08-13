import React from 'react';

/*
 * jsdom overlay-scrollbar stub (SOU-216). OverlayScrollbars measures layout via
 * getComputedStyle, which jsdom cannot resolve — the lib throws on mount. The
 * stub preserves the primitive's React contract: a host element (with the
 * caller's className) containing a viewport and the children. It forwards the
 * `osInstance()` ref so ScrollArea users (e.g. the shell skip-link keyboard
 * handler) work in unit tests. E2E exercises the real lib under Chromium.
 */

type StubRef = {
  osInstance: () => { elements: () => { viewport: HTMLDivElement } } | null;
  getElement: () => HTMLDivElement | null;
};

export const OverlayScrollbarsComponent = React.forwardRef<StubRef, {
  children?: React.ReactNode;
  className?: string;
}>(({ children, className, ...props }, ref) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  React.useImperativeHandle(ref, () => ({
    osInstance: () =>
      viewportRef.current
        ? { elements: () => ({ viewport: viewportRef.current as HTMLDivElement }) }
        : null,
    getElement: () => hostRef.current,
  }));

  return (
    <div ref={hostRef} className={className} data-overlayscrollbars="mock" {...props}>
      <div ref={viewportRef} data-overlayscrollbars-viewport="mock">
        {children}
      </div>
    </div>
  );
});
OverlayScrollbarsComponent.displayName = 'OverlayScrollbarsComponent';

export function useOverlayScrollbars() {
  return [() => {}, () => null] as const;
}
