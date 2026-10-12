// shadcn/ui Calendar (react-day-picker), adapted to v10; Vietnamese, week starts on Monday, no animation.
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { DayButton, DayPicker, getDefaultClassNames } from 'react-day-picker';
import { vi } from 'react-day-picker/locale';
import { cn } from '../../lib/utils';
import { Button, buttonVariants } from './button';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();
  return (
    <DayPicker
      locale={vi}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn('bg-background group/calendar p-3 [--cell-size:2.25rem] [[data-slot=popover-content]_&]:bg-transparent', className)}
      captionLayout={captionLayout}
      formatters={{
        formatCaption: date => `Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`,
        formatWeekdayName: date => WEEKDAYS[date.getDay()],
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
        button_previous: cn(buttonVariants({ variant: 'ghost' }), 'size-(--cell-size) p-0 select-none aria-disabled:opacity-50', defaultClassNames.button_previous),
        button_next: cn(buttonVariants({ variant: 'ghost' }), 'size-(--cell-size) p-0 select-none aria-disabled:opacity-50', defaultClassNames.button_next),
        month_caption: cn('flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)', defaultClassNames.month_caption),
        caption_label: cn('text-sm font-medium select-none', defaultClassNames.caption_label),
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn('text-muted-foreground flex-1 rounded-md text-sm font-normal select-none', defaultClassNames.weekday),
        week: cn('mt-1 flex w-full', defaultClassNames.week),
        day: cn('group/day relative aspect-square h-full w-full p-0 text-center select-none', defaultClassNames.day),
        today: cn('rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none', defaultClassNames.today),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClass, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(rootClass)} {...rootProps} />
        ),
        Chevron: ({ className: chevronClass, orientation, ...chevronProps }) => {
          if (orientation === 'left') return <ChevronLeftIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
          if (orientation === 'right') return <ChevronRightIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
          return <ChevronDownIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

export function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected || undefined}
      className={cn(
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}
