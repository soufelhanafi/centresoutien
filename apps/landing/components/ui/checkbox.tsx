import * as React from "react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
