import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

const FIELD_CLASSES =
  'h-9 w-full rounded-md border border-line bg-ink px-3 text-sm text-chalk placeholder:text-chalk-faint focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(FIELD_CLASSES, 'pr-8', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('font-mono text-xs uppercase tracking-wide text-chalk-muted', className)}
      {...props}
    />
  );
}
