/* SVG data-viz components. Exposed on window.
   GaugeRing, ProgressRing, Donut, AreaChart, BarChart, Sparkline */
(function () {
  const { useState, useEffect, useRef } = React;

  // animate a number 0->value once mounted. Seeds to the FINAL value when the
  // page isn't visible (backgrounded tab) so screenshots/print never show 0.
  function useCountUp(value, ms = 1100) {
    const [v, setV] = useState(value);
    useEffect(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { setV(value); return; }
      let raf, start;
      setV(0);
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const tick = (now) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / ms);
        setV(value * ease(p));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value]);
    return v;
  }

  // ---- KPI Gauge: 270° arc with needle-free fill ----
  function GaugeRing({ value, size = 116, stroke = 11, color = 'var(--accent)', label, suffix = '%' }) {
    const v = useCountUp(value);
    const r = (size - stroke) / 2;
    const cx = size / 2, cy = size / 2;
    const start = 135, sweep = 270;
    const polar = (ang) => {
      const a = (ang - 90) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const arc = (from, to) => {
      const [x1, y1] = polar(from), [x2, y2] = polar(to);
      const large = to - from > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    };
    const pct = Math.max(0, Math.min(100, v));
    return React.createElement('div', { style: { position: 'relative', width: size, height: size } },
      React.createElement('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
        React.createElement('path', { d: arc(start, start + sweep), fill: 'none', stroke: 'var(--panel-3)', strokeWidth: stroke, strokeLinecap: 'round' }),
        React.createElement('path', { d: arc(start, start + sweep * (pct / 100)), fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round' }),
      ),
      React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', flexDirection: 'column', textAlign: 'center' } },
        React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontSize: size * 0.26 + 'px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 } },
          Math.round(v), React.createElement('span', { style: { fontSize: '0.55em', color: 'var(--text-3)' } }, suffix)),
        label && React.createElement('div', { style: { fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 600, marginTop: 4 } }, label),
      ),
    );
  }

  // ---- Closed progress ring ----
  function ProgressRing({ value, size = 54, stroke = 6, color = 'var(--accent)', showText = true }) {
    const v = useCountUp(value);
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const off = circ * (1 - Math.max(0, Math.min(100, v)) / 100);
    return React.createElement('div', { style: { position: 'relative', width: size, height: size, flexShrink: 0 } },
      React.createElement('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
        React.createElement('circle', { cx: size/2, cy: size/2, r, fill: 'none', stroke: 'var(--panel-3)', strokeWidth: stroke }),
        React.createElement('circle', { cx: size/2, cy: size/2, r, fill: 'none', stroke: color, strokeWidth: stroke,
          strokeLinecap: 'round', strokeDasharray: circ, strokeDashoffset: off,
          transform: `rotate(-90 ${size/2} ${size/2})` }),
      ),
      showText && React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.26 + 'px', fontWeight: 700, fontFamily: 'var(--font-display)' } }, Math.round(v) + '%'),
    );
  }

  // ---- Donut chart ----
  function Donut({ data, size = 168, stroke = 26 }) {
    const prog = useCountUp(100);
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    let acc = 0;
    const arcs = data.map((d) => {
      const frac = d.value / total;
      const seg = { ...d, frac, dash: circ * frac * (prog / 100), gap: circ, offset: -acc * circ };
      acc += frac;
      return seg;
    });
    return React.createElement('div', { style: { position: 'relative', width: size, height: size, margin: '0 auto' } },
      React.createElement('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
        React.createElement('circle', { cx: size/2, cy: size/2, r, fill: 'none', stroke: 'var(--panel-3)', strokeWidth: stroke }),
        arcs.map((s, i) => React.createElement('circle', {
          key: i, cx: size/2, cy: size/2, r, fill: 'none', stroke: s.color, strokeWidth: stroke,
          strokeDasharray: `${s.dash} ${circ}`, strokeDashoffset: s.offset,
          transform: `rotate(-90 ${size/2} ${size/2})`,
          style: { transition: 'stroke-dasharray 0.2s' },
        })),
      ),
      React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontSize: size * 0.2 + 'px', fontWeight: 700, lineHeight: 1 } }, Math.round(total)),
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 600 } }, 'total'),
      ),
    );
  }

  // ---- Area / line chart ----
  function AreaChart({ data, height = 200, color = 'var(--accent)', color2 = 'var(--teal)', labels }) {
    const ref = useRef(null);
    const [w, setW] = useState(600);
    const [t, setT] = useState(typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 1 : 0);
    useEffect(() => {
      const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
      if (ref.current) ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    useEffect(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { setT(1); return; }
      let raf, start;
      const tick = (now) => { if (!start) start = now; const p = Math.min(1, (now - start) / 1000); setT(p); if (p < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
    }, []);
    const pad = { l: 8, r: 8, t: 14, b: 26 };
    const max = Math.max(...data) * 1.15 || 1;
    const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
    const pts = data.map((d, i) => [pad.l + (i / (data.length - 1)) * iw, pad.t + ih - (d / max) * ih]);
    const id = 'g' + Math.round(color.length * 99 + data.length);
    const lineP = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const areaP = lineP + ` L ${pad.l + iw} ${pad.t + ih} L ${pad.l} ${pad.t + ih} Z`;
    const len = 1400;
    return React.createElement('div', { ref, style: { width: '100%' } },
      React.createElement('svg', { width: '100%', height, viewBox: `0 0 ${w} ${height}` },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
            React.createElement('stop', { offset: '0%', stopColor: color, stopOpacity: 0.32 }),
            React.createElement('stop', { offset: '100%', stopColor: color, stopOpacity: 0 }),
          )),
        [0.25, 0.5, 0.75, 1].map((g, i) => React.createElement('line', { key: i, x1: pad.l, x2: pad.l + iw, y1: pad.t + ih * g, y2: pad.t + ih * g, stroke: 'var(--line)', strokeWidth: 1 })),
        React.createElement('path', { d: areaP, fill: `url(#${id})`, opacity: t }),
        React.createElement('path', { d: lineP, fill: 'none', stroke: color, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round',
          strokeDasharray: len, strokeDashoffset: len * (1 - t) }),
        pts.map((p, i) => React.createElement('circle', { key: i, cx: p[0], cy: p[1], r: 3, fill: 'var(--bg-base)', stroke: color, strokeWidth: 2, opacity: t })),
        labels && labels.map((l, i) => React.createElement('text', { key: i, x: pad.l + (i / (labels.length - 1)) * iw, y: height - 6, textAnchor: 'middle', fontSize: 11, fill: 'var(--text-3)', fontWeight: 600 }, l)),
      ),
    );
  }

  // ---- Bar chart ----
  function BarChart({ data, height = 200, color = 'var(--accent)', labels }) {
    const t = useCountUp(100);
    const max = Math.max(...data) * 1.12 || 1;
    return React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '8px', height, padding: '14px 0 0' } },
      data.map((d, i) => React.createElement('div', { key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' } },
        React.createElement('div', { style: { width: '100%', maxWidth: 34, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1 } },
          React.createElement('div', { style: {
            height: ((d / max) * (t / 100) * 100) + '%',
            background: i === data.length - 1 ? `linear-gradient(180deg, var(--accent), var(--accent-700))` : 'var(--accent-soft)',
            border: i === data.length - 1 ? 'none' : '1px solid var(--line)',
            borderRadius: '8px 8px 4px 4px', minHeight: 4,
          } })),
        labels && React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600 } }, labels[i]),
      )),
    );
  }

  // ---- Sparkline (mini) ----
  function Sparkline({ data, width = 90, height = 30, color = 'var(--accent)' }) {
    const max = Math.max(...data), min = Math.min(...data);
    const rng = max - min || 1;
    const pts = data.map((d, i) => [(i / (data.length - 1)) * width, height - ((d - min) / rng) * (height - 4) - 2]);
    const p = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
    return React.createElement('svg', { width, height, viewBox: `0 0 ${width} ${height}` },
      React.createElement('path', { d: p, fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    );
  }

  Object.assign(window, { GaugeRing, ProgressRing, Donut, AreaChart, BarChart, Sparkline, useCountUp });
})();
