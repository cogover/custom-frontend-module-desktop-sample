// Shared look of the shadcn field triggers (Select trigger, Date Picker, Combobox): same classes as SelectTrigger.
export const fieldTriggerClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:ring-[3px] aria-invalid:border-destructive flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm font-normal whitespace-nowrap shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** Heights of the design: 44px in the task form, 34px in the filter panel. */
// (the data-[size=…] forms also beat SelectTrigger's own data-[size=default]:h-9)
export const FIELD_H = {
  default: 'h-11 data-[size=default]:h-11',
  /** task form properties (36px, 14px text) */
  compact: 'h-9 data-[size=default]:h-9 text-sm',
  sm: 'h-[34px] data-[size=default]:h-[34px] px-2.5 text-sm',
} as const;
