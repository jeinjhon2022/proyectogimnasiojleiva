import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

// Estilo "etiqueta de placa/casillero": esquinas rectas, mono en mayúsculas con
// tracking amplio y un punto de estado, en vez del pill genérico de shadcn.
const TONE_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-surface-raised text-chalk-muted before:bg-chalk-muted',
  success: 'bg-success-soft text-success before:bg-success',
  warning: 'bg-warning-soft text-warning before:bg-warning',
  danger: 'bg-danger-soft text-danger before:bg-danger',
  info: 'bg-info-soft text-info before:bg-info',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider before:h-1.5 before:w-1.5 before:rounded-full',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
