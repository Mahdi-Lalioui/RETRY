import { cn } from './cn';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn(
      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-white/15 bg-white/[0.06] px-1 font-mono text-[10px] font-medium leading-none text-white/70 shadow-[inset_0_-1px_0_#ffffff10]',
      className,
    )}>
      {children}
    </kbd>
  );
}
