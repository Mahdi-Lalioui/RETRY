import { cn } from './cn';

/** CSS-only tooltip (no portal, no JS): shows on hover/focus-within. */
export function Tooltip({ label, children, side = 'top', className }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom'; className?: string }) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-md border border-white/10 bg-[#12161E]/95 px-2 py-1 text-[11px] leading-snug text-white/80 opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
        )}
      >
        {label}
      </span>
    </span>
  );
}
