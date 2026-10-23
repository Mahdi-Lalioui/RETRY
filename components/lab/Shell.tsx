import Link from 'next/link';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './lab.css';
import { ModePill } from './ModePill';

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontSize: size }}>
      <svg width={size + 4} height={size + 4} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke="#22D3EE" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M17.8 3.2v3.9h-3.9" stroke="#22D3EE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.2" fill="#FF4500" />
      </svg>
      <span className="font-bold tracking-[-0.02em]">RETRY</span>
    </span>
  );
}

const NAV = [
  { href: '/', label: 'Mission Control' },
  { href: '/lab', label: 'Lab' },
  { href: '/corrections', label: 'Corrections' },
  { href: '/attract', label: 'Attract' },
];

/** Dark control-room frame shared by /lab and /corrections (Geist, §14.1 tokens). */
export function Shell({ active, children, bare = false }: { active?: string; children: React.ReactNode; bare?: boolean }) {
  return (
    <div className={`rx ${GeistSans.variable} ${GeistMono.variable}`}>
      {!bare && (
        <header className="sticky top-0 z-30 border-b hairline bg-[#07080Bcc] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-6 px-6">
            <Link href="/" className="flex items-center gap-3">
              <Wordmark />
              <span className="rounded-md border border-[#F59E0B55] bg-[#F59E0B14] px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-[#FCD34D]">NIGHT SHIFT</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}
                  className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${active === n.href ? 'bg-white/[0.06] text-[var(--rx-text)]' : 'muted hover:text-[var(--rx-text)]'}`}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto"><ModePill /></div>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}
