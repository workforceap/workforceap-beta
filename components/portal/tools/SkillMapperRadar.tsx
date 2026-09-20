'use client';

type Axis = { axis: string; value: number; maxValue: number; hasData: boolean };

export default function SkillMapperRadar({
  axes,
  size = 280,
}: {
  axes: Axis[];
  size?: number;
}) {
  const n = axes.length;
  if (n < 3) {
    return <p style={{ color: 'var(--color-on-surface-variant)' }}>Not enough data for a radar chart.</p>;
  }
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const angle = (i: number) => (-Math.PI / 2 + (2 * Math.PI * i) / n) % (2 * Math.PI);
  const point = (i: number, r: number) => {
    const a = angle(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const poly = axes
    .map((a, i) => {
      const v = a.value / Math.max(a.maxValue, 1);
      const r = maxR * Math.min(1, v);
      const p = point(i, r);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Skill profile radar chart">
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          fill="none"
          stroke="var(--outline-variant, rgba(0,0,0,0.12))"
          strokeWidth={1}
          points={axes
            .map((_, i) => {
              const p = point(i, maxR * lv);
              return `${p.x},${p.y}`;
            })
            .join(' ')}
        />
      ))}
      {axes.map((a, i) => {
        const p0 = point(i, maxR);
        const pInner = point(i, 0);
        return (
          <line
            key={a.axis}
            x1={pInner.x}
            y1={pInner.y}
            x2={p0.x}
            y2={p0.y}
            stroke="var(--outline-variant, rgba(0,0,0,0.1))"
            strokeWidth={1}
          />
        );
      })}
      <polygon fill="rgba(173,44,77,0.15)" stroke="var(--color-accent)" strokeWidth={2} points={poly} />
      {axes.map((a, i) => {
        const v = a.value / Math.max(a.maxValue, 1);
        const r = maxR * Math.min(1, v);
        const p = point(i, r);
        return <circle key={`d-${a.axis}`} cx={p.x} cy={p.y} r={3} fill="var(--color-accent)" />;
      })}
      {axes.map((a, i) => {
        const p = point(i, maxR + 22);
        return (
          <text
            key={`l-${a.axis}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fill="var(--color-on-surface-variant)"
          >
            {a.axis}
          </text>
        );
      })}
    </svg>
  );
}
