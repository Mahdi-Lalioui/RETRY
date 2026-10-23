import { cn } from './cn';

export function Badge({ children, className, color, style }: { children: React.ReactNode; className?: string; color?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-[2px] font-mono text-[10.5px] font-medium leading-4 tracking-wide', className)}
      style={{
        color: color ?? 'var(--muted)',
        borderColor: color ? `color-mix(in oklab, ${color} 40%, transparent)` : 'var(--border)',
        background: color ? `color-mix(in oklab, ${color} 10%, transparent)` : 'transparent',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
