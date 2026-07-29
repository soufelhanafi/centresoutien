import * as React from 'react';
import type { Locale } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayButtonProps, type DayPickerProps } from 'react-day-picker';
import { cn } from '@ui/lib/utils';
import { Button, buttonVariants } from '@ui/components/ui/button';

// react-day-picker's own `DayPickerProps` already declares `locale` and `dir`,
// but this package must stay locale-data-free: the renderer supplies the
// date-fns Locale object (fr or ar-MA) and the direction, never packages/ui.
export type CalendarProps = DayPickerProps & {
  /** date-fns locale supplied by the renderer (fr or ar-MA). */
  locale?: Locale;
  dir?: 'ltr' | 'rtl';
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  ...props
}: CalendarProps & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('group/calendar bg-background p-3 [--cell-size:--spacing(8)]', className)}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-8 items-center gap-1 rounded-md ps-2 pe-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn('text-[0.8rem] text-muted-foreground select-none', defaultClassNames.week_number),
        // `first-child` / `last-child` reflect DOM order, which flex flips
        // visually under RTL — so "first" is genuinely the inline-start cell
        // and "last" the inline-end cell in both directions.
        day: cn(
          'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-e-md',
          props.showWeekNumber
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-s-md'
            : '[&:first-child[data-selected=true]_button]:rounded-s-md',
          defaultClassNames.day,
        ),
        range_start: cn('rounded-s-md bg-accent', defaultClassNames.range_start),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn('rounded-e-md bg-accent', defaultClassNames.range_end),
        today: cn(
          'rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none',
          defaultClassNames.today,
        ),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(rootClassName)} {...rootProps} />
        ),
        // Prev/next are genuine sideways-pointing directional icons — mirror
        // them under RTL. The down chevron (month/year dropdowns) is not
        // directional and stays fixed.
        Chevron: ({ className: chevronClassName, orientation, ...chevronProps }) => {
          if (orientation === 'left') {
            return <ChevronLeft className={cn('size-4 rtl:rotate-180', chevronClassName)} {...chevronProps} />;
          }
          if (orientation === 'right') {
            return <ChevronRight className={cn('size-4 rtl:rotate-180', chevronClassName)} {...chevronProps} />;
          }
          return <ChevronDown className={cn('size-4', chevronClassName)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...weekNumberProps }) => (
          <td {...weekNumberProps}>
            <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers['focused']) ref.current?.focus();
  }, [modifiers['focused']]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers['selected'] &&
        !modifiers['range_start'] &&
        !modifiers['range_end'] &&
        !modifiers['range_middle']
      }
      data-range-start={modifiers['range_start']}
      data-range-end={modifiers['range_end']}
      data-range-middle={modifiers['range_middle']}
      className={cn(
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-md data-[range-end=true]:rounded-e-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-s-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
