import { ImageResponse } from 'next/og';
import { PROGRAMS } from '@/lib/content/programs';

export const runtime = 'edge';

const MAROON = '#a01142';
const MAROON_DARK = '#5e0a26';
const GOLD = '#ffd166';
const WHITE = '#ffffff';
const TEXT_MUTED = 'rgba(255,255,255,0.78)';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const program = PROGRAMS.find((p) => p.slug === slug);

  const title = program?.title ?? 'Workforce Advancement Project';
  const partner = program?.partner ?? 'Professional Certificate';
  const duration = program?.duration ?? '3-5 months, 10 hrs/week';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${MAROON} 0%, ${MAROON_DARK} 100%)`,
          padding: '64px 70px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -120, right: -90, width: 390, height: 390, borderRadius: 390, background: GOLD, opacity: 0.18, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -90, left: 440, width: 260, height: 260, borderRadius: 260, background: '#06d6a0', opacity: 0.18, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 76, right: 88, width: 150, height: 150, borderRadius: 34, border: '5px solid rgba(255,255,255,0.18)', transform: 'rotate(10deg)', display: 'flex' }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900, zIndex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.16)',
              border: '2px solid rgba(255,255,255,0.24)',
              color: WHITE,
              padding: '14px 26px',
              borderRadius: 999,
              fontSize: 27,
              fontWeight: 850,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 20,
                height: 20,
                borderRadius: 20,
                background: GOLD,
                boxShadow: `0 0 28px ${GOLD}`,
              }}
            />
            {partner} Professional Certificate
          </div>

          <div style={{ display: 'flex', color: WHITE, fontSize: 78, fontWeight: 950, lineHeight: 1.04, marginTop: 36 }}>
            {title}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: TEXT_MUTED, fontSize: 29, fontWeight: 700, marginTop: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: 58, background: GOLD, color: MAROON, fontSize: 38, fontWeight: 950 }}>✓</div>
            {duration} · No cost for qualifying members
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: WHITE, fontSize: 29, fontWeight: 800, zIndex: 1 }}>
          <div style={{ display: 'flex', opacity: 0.9 }}>WorkforceAP · Austin, TX</div>
          <div style={{ display: 'flex', background: WHITE, color: MAROON, padding: '10px 22px', borderRadius: 12, fontWeight: 900 }}>
            Apply now
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
