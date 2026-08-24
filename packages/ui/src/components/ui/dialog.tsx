import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@ui/lib/utils';
import { ScrollArea, type ScrollAreaProps } from '@ui/components/ui/scroll-area';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
};

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeLabel = 'Fermer', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // Centering is `left-1/2 + -translate-x-1/2` (both physical) on purpose: the
      // translate is physical, so pairing it with a logical `start-1/2` pushes the
      // modal off-screen in RTL (start becomes right, translate still goes left).
      // A centered overlay is direction-agnostic; its inner text still flows via dir.
      // The content box itself never scrolls — it caps height at 85vh and clips to
      // its rounded border, so the absolutely-positioned close button stays pinned.
      // The inner wrapper owns the scroll: a tall DialogBody scrolls internally, and
      // a modal without one still scrolls there rather than clipping its actions
      // off-screen (SOU-311).
      className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg',
        className,
      )}
      {...props}
    >
      <div data-dialog-scroll className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        {children}
      </div>
      <DialogPrimitive.Close className="absolute end-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{closeLabel}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex shrink-0 flex-col gap-1.5 text-start', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export type DialogBodyProps = ScrollAreaProps;

/*
 * Scrollable body region for a modal. Sits between the pinned DialogHeader and
 * DialogFooter and absorbs overflow so a tall form never pushes the action
 * buttons off-screen (SOU-311). The `-mx-1 px-1` horizontal gutter keeps input
 * focus rings from being clipped against the scroll edges (SOU-282); `py-4`
 * gives the body vertical breathing room from the pinned header/footer.
 */
export function DialogBody({ className, contentClassName, ...props }: DialogBodyProps) {
  return (
    <ScrollArea
      className={cn('min-h-0 flex-1', className)}
      contentClassName={cn('-mx-1 px-1 py-4', contentClassName)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
