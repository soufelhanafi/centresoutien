/**
 * @centresoutien/ui — shared, RTL-safe shadcn/ui wrappers.
 * Consumed by the desktop renderer today and the future web SaaS frontend.
 * Design tokens: import '@centresoutien/ui/styles/tokens.css'.
 */
export { cn } from './lib/utils';
export { DirectionProvider } from '@radix-ui/react-direction';
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
export { Input } from '@ui/components/ui/input';
export type { InputProps } from '@ui/components/ui/input';
export { Textarea } from '@ui/components/ui/textarea';
export type { TextareaProps } from '@ui/components/ui/textarea';
export { Label } from '@ui/components/ui/label';
export type { LabelProps } from '@ui/components/ui/label';
export { Checkbox } from '@ui/components/ui/checkbox';
export { Switch } from '@ui/components/ui/switch';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from '@ui/components/ui/select';
export type { SelectTriggerProps } from '@ui/components/ui/select';
export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from '@ui/components/ui/form';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@ui/components/ui/sheet';
export type { SheetContentProps } from '@ui/components/ui/sheet';
export { Popover, PopoverTrigger, PopoverContent } from '@ui/components/ui/popover';
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@ui/components/ui/tooltip';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@ui/components/ui/dropdown-menu';
export type { DropdownMenuItemProps, DropdownMenuLabelProps } from '@ui/components/ui/dropdown-menu';
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@ui/components/ui/command';
export type { CommandDialogProps } from '@ui/components/ui/command';
export { Toaster } from '@ui/components/ui/sonner';
export { toast } from 'sonner';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@ui/components/ui/card';
export { Tabs, TabsList, TabsTrigger, TabsContent } from '@ui/components/ui/tabs';
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@ui/components/ui/table';
export { Badge, badgeVariants } from '@ui/components/ui/badge';
export type { BadgeProps } from '@ui/components/ui/badge';
export { StatusBadge } from '@ui/components/badge/status-badge';
export type { StatusBadgeProps, InvoiceStatusTone } from '@ui/components/badge/status-badge';
export { KindBadge } from '@ui/components/badge/kind-badge';
export type { KindBadgeProps, SessionKindTone } from '@ui/components/badge/kind-badge';
export { PlanBadge } from '@ui/components/badge/plan-badge';
export type { PlanBadgeProps, PlanTier } from '@ui/components/badge/plan-badge';
export { Avatar, AvatarImage, AvatarFallback } from '@ui/components/ui/avatar';
export { Skeleton } from '@ui/components/ui/skeleton';
export type { SkeletonProps } from '@ui/components/ui/skeleton';
export { Calendar } from '@ui/components/ui/calendar';
export type { CalendarProps } from '@ui/components/ui/calendar';
export { LockOverlay } from '@ui/components/feedback/lock-overlay';
export type { LockOverlayProps } from '@ui/components/feedback/lock-overlay';
export { EmptyState } from '@ui/components/feedback/empty-state';
export type { EmptyStateProps } from '@ui/components/feedback/empty-state';
export {
  DataTable,
  DataTableRow,
  DataTableHead,
  DataTableCell,
} from '@ui/components/data/data-table';
export type { DataTableProps } from '@ui/components/data/data-table';
export { Numeric } from '@ui/components/data/numeric';
export type { NumericProps } from '@ui/components/data/numeric';
export { BilingualText } from '@ui/components/data/bilingual-text';
export type { BilingualTextProps } from '@ui/components/data/bilingual-text';
