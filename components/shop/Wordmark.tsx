export function Moon({ size = 18, color = '#1F3D2B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M15.5 2.6A9.6 9.6 0 1 0 21.4 15 7.6 7.6 0 0 1 15.5 2.6Z" fill={color} />
      <circle cx="18.6" cy="5.2" r="1.15" fill={color} opacity=".55" />
      <circle cx="21" cy="9.4" r=".7" fill={color} opacity=".35" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[#111]">
      <Moon size={20} />
      <span className="text-[15px] font-semibold tracking-[0.28em]">NIGHT MARKET</span>
    </span>
  );
}
