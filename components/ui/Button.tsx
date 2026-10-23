import { forwardRef } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'ghost' | 'danger' | 'learn' | 'subtle';
const styles: Record<Variant, string> = {
  primary: 'bg-white text-black hover:bg-white/90 shadow-[0_0_0_1px_#fff,0_8px_24px_-8px_#ffffff66]',
  ghost: 'text-white/80 hover:text-white hover:bg-white/[0.07]',
  subtle: 'bg-white/[0.05] text-white/85 hover:bg-white/[0.09] border border-white/10',
  danger: 'text-fail hover:bg-fail/10',
  learn: 'text-learn hover:bg-learn/10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; active?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'ghost', active, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-8 select-none items-center gap-2 whitespace-nowrap rounded-[9px] px-2.5 text-[12.5px] font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        styles[variant],
        active && 'bg-white/[0.1] text-white',
        className,
      )}
      {...props}
    />
  );
});
