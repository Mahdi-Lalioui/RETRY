'use client';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/shop/cn';

export const ACCENT = '#1F3D2B';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';
export function Btn({ variant = 'primary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] transition-all duration-200 select-none cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
        size === 'sm' && 'h-9 px-4 text-[13px]',
        size === 'md' && 'h-11 px-6 text-[14px]',
        size === 'lg' && 'h-[52px] px-8 text-[15px]',
        variant === 'primary' && 'bg-[#1F3D2B] text-[#F7F5EE] shadow-[0_1px_0_rgba(255,255,255,.12)_inset,0_8px_20px_-10px_rgba(31,61,43,.7)] hover:bg-[#274D37]',
        variant === 'secondary' && 'bg-white text-[#111] ring-1 ring-black/10 hover:ring-black/25 shadow-[0_1px_2px_rgba(0,0,0,.04)]',
        variant === 'ghost' && 'bg-transparent text-[#111] hover:bg-black/[0.04]',
        variant === 'quiet' && 'bg-[#EFEDE5] text-[#111] hover:bg-[#E6E3D8]',
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-[14px] bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(17,17,17,.04),0_12px_32px_-18px_rgba(17,17,17,.18)]', className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-[11px] font-medium uppercase tracking-[0.16em] text-[#6B6B63]', className)}>{children}</div>;
}
