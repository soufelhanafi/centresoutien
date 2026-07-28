/**
 * @centresoutien/ui — shared, RTL-safe shadcn/ui wrappers.
 * Consumed by the desktop renderer today and the future web SaaS frontend.
 * Design tokens: import '@centresoutien/ui/styles/tokens.css'.
 */
export { cn } from './lib/utils';
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
export type { DialogContentProps } from './components/ui/dialog';
export { Label } from './components/ui/label';
export type { LabelProps } from './components/ui/label';
export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';
export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from './components/ui/form';
