// shadcn/ui Input, transitions removed.
import type * as React from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:ring-[3px] aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
