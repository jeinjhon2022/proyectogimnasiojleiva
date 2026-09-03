import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper estándar (el mismo patrón que usa shadcn/ui) para combinar clases de
// Tailwind sin choques cuando un componente recibe className desde fuera.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
