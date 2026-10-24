import { ImageResponse } from 'next/og';

export const alt = 'RETRY — the AI QA tester that learns your house rules from every rescue, through Mubit';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const step = (n: string, t: string, c: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 14, border: `2px solid ${c}66`, background: `${c}14`, color: '#E8EDF5', fontSize: 24 }}>
      <span style={{ color: c, fontWeight: 700, marginRight: 4 }}>{n}</span>{t}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'radial-gradient(900px 420px at 80% 0%, #FF450033, transparent 70%), radial-gradient(700px 400px at 0% 100%, #22D3EE22, transparent 70%)', backgroundColor: '#07080B', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <path d="M50 32a18 18 0 1 1-5.27-12.73" fill="none" stroke="#22D3EE" strokeWidth="6" strokeLinecap="round" />
            <path d="M51 9.5v10.5H40.5" fill="none" stroke="#22D3EE" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="6" fill="#FF4500" />
          </svg>
          <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>RETRY</span>
          <span style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 8, border: '2px solid #F59E0B88', color: '#FCD34D', fontSize: 22, letterSpacing: 4 }}>NIGHT SHIFT</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Self-healing tools guess.</div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: '#22D3EE' }}>RETRY learns your rules from every rescue.</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {step('1', 'Every call via Mubit', '#FF4500')}
          {step('2', 'Rescue to training pair', '#F59E0B')}
          {step('3', 'Versioned update', '#22D3EE')}
          {step('4', 'Held-out gate', '#34D399')}
        </div>
      </div>
    ),
    size,
  );
}
