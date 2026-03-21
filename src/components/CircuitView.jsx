// 回路図SVGコンポーネント - 直列/並列回路を電流矢印付きで描画
const CL = { R: '#4ade80', L: '#a78bfa', C: '#fb923c', wire: '#64748b', wireLight: '#475569', I: '#06b6d4', V: '#f97316' };

function ACSrc({ cx, cy, r = 20, isDark }) {
  return <g>
    <circle cx={cx} cy={cy} r={r} fill={isDark ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)"} stroke={isDark ? CL.wire : CL.wireLight} strokeWidth="1.5" />
    <path d={`M${cx-r*.55},${cy} Q${cx-r*.18},${cy-r*.6} ${cx},${cy} Q${cx+r*.18},${cy+r*.6} ${cx+r*.55},${cy}`} fill="none" stroke={isDark ? "#e2e8f0" : "#334155"} strokeWidth="1.5" />
  </g>;
}
function Res({ x, y, w = 50 }) {
  const s = w / 6;
  return <g><path d={`M${x-w/2},${y} l${s},-10 l${s},20 l${s},-20 l${s},20 l${s},-20 l${s},10`} fill="none" stroke={CL.R} strokeWidth="2" /><text x={x} y={y-14} textAnchor="middle" fill={CL.R} fontSize="11" fontWeight="600">R</text></g>;
}
function Ind({ x, y, w = 50 }) {
  const r = w / 8;
  return <g><path d={`M${x-w/2},${y} a${r},${r} 0 0 1 ${r*2},0 a${r},${r} 0 0 1 ${r*2},0 a${r},${r} 0 0 1 ${r*2},0 a${r},${r} 0 0 1 ${r*2},0`} fill="none" stroke={CL.L} strokeWidth="2" /><text x={x} y={y-14} textAnchor="middle" fill={CL.L} fontSize="11" fontWeight="600">L</text></g>;
}
function Cap({ x, y }) {
  return <g><line x1={x-4} y1={y-12} x2={x-4} y2={y+12} stroke={CL.C} strokeWidth="2.5" /><line x1={x+4} y1={y-12} x2={x+4} y2={y+12} stroke={CL.C} strokeWidth="2.5" /><text x={x} y={y-16} textAnchor="middle" fill={CL.C} fontSize="11" fontWeight="600">C</text></g>;
}
// 電流矢印
function IArr({ x, y, dir, mag, hz = true }) {
  const sz = 4 + mag * 7, op = 0.3 + mag * 0.7;
  if (hz) { const dx = dir * sz; return <polygon points={`${x+dx},${y} ${x-dx*.4},${y-sz*.5} ${x-dx*.4},${y+sz*.5}`} fill={CL.I} opacity={op} />; }
  const dy = dir * sz; return <polygon points={`${x},${y+dy} ${x-sz*.5},${y-dy*.4} ${x+sz*.5},${y-dy*.4}`} fill={CL.I} opacity={op} />;
}
// 電流バーグラフ
function IBar({ x, y, value, maxH = 30, isDark }) {
  const h = Math.abs(value) * maxH, by = value >= 0 ? y - h : y;
  const wireColor = isDark ? CL.wire : CL.wireLight;
  return <g><rect x={x-8} y={y-maxH} width={16} height={maxH*2} fill={isDark ? "rgba(100,116,139,0.1)" : "rgba(148,163,184,0.2)"} rx={2} /><rect x={x-6} y={by} width={12} height={Math.max(h, 1)} fill={CL.I} opacity={0.7} rx={2} /><line x1={x-10} y1={y} x2={x+10} y2={y} stroke={wireColor} strokeWidth="0.5" /><text x={x} y={y+maxH+12} textAnchor="middle" fill={wireColor} fontSize="8">I(t)</text></g>;
}
// 計器
function Meter({ x, y, label, color, isDark }) {
  if (!color) color = isDark ? CL.wire : CL.wireLight;
  return <g><circle cx={x} cy={y} r={10} fill={isDark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)"} stroke={color} strokeWidth="1" /><text x={x} y={y+4} textAnchor="middle" fill={color} fontSize="9" fontWeight="700">{label}</text></g>;
}

// 直列回路
function Series({ enabled, iNorm, showMeters, showBar, isDark }) {
  const iM = Math.abs(iNorm), iD = iNorm >= 0 ? 1 : -1;
  const acX = 42, acY = 85, topY = 25, botY = 145, rX = 438;
  const wireColor = isDark ? CL.wire : CL.wireLight;
  // 有効素子の位置計算
  const comps = [];
  if (enabled.R) comps.push({ key: 'R', Comp: Res });
  if (enabled.L) comps.push({ key: 'L', Comp: Ind });
  if (enabled.C) comps.push({ key: 'C', Comp: Cap });
  const sp = comps.length > 0 ? (rX - acX - 80) / (comps.length + 1) : 0;
  const positions = comps.map((c, i) => ({ ...c, x: acX + 60 + sp * (i + 1) }));

  return <g>
    {/* 配線 */}
    <line x1={acX} y1={topY} x2={rX} y2={topY} stroke={wireColor} strokeWidth="1.5" />
    <line x1={rX} y1={topY} x2={rX} y2={botY} stroke={wireColor} strokeWidth="1.5" />
    <line x1={rX} y1={botY} x2={acX} y2={botY} stroke={wireColor} strokeWidth="1.5" />
    <line x1={acX} y1={botY} x2={acX} y2={acY+20} stroke={wireColor} strokeWidth="1.5" />
    <line x1={acX} y1={acY-20} x2={acX} y2={topY} stroke={wireColor} strokeWidth="1.5" />
    <ACSrc cx={acX} cy={acY} isDark={isDark} />
    {/* 素子 */}
    {positions.map(p => <g key={p.key}><p.Comp x={p.x} y={topY} /></g>)}
    {/* 電流矢印 */}
    <IArr x={acX+30} y={topY} dir={iD} mag={iM} />
    <IArr x={rX-30} y={topY} dir={iD} mag={iM} />
    {/* 矢印の向き(dir)を -iD から iD に修正 (右辺は下向き正) */}
    <IArr x={rX} y={85} dir={iD} mag={iM} hz={false} />
    <IArr x={(acX+rX)/2} y={botY} dir={-iD} mag={iM} />
    {/* バーグラフ */}
    {showBar && <IBar x={rX+28} y={85} value={iNorm} isDark={isDark} />}
    {/* 計器 */}
    {showMeters && <>
      <Meter x={(acX+rX)/2} y={botY-18} label="A" color={CL.I} isDark={isDark} />
      {positions.map(p => <Meter key={`m${p.key}`} x={p.x} y={topY+28} label="V" color={CL[p.key]} isDark={isDark} />)}
    </>}
  </g>;
}

// 並列回路
function Parallel({ enabled, phaseAngle, showMeters, isDark }) {
  const acX = 42, acY = 85, lx = 95, rx = 385;
  const wireColor = isDark ? CL.wire : CL.wireLight;
  const branches = [];
  if (enabled.R) branches.push({ key: 'R', Comp: Res, phase: 0 });
  if (enabled.L) branches.push({ key: 'L', Comp: Ind, phase: -Math.PI / 2 });
  if (enabled.C) branches.push({ key: 'C', Comp: Cap, phase: Math.PI / 2 });
  if (branches.length === 0) return null;
  const sp = 120 / (branches.length + 1);
  const ys = branches.map((_, i) => 15 + sp * (i + 1));
  const midX = (lx + rx) / 2;

  return <g>
    {/* 左右バス */}
    <line x1={lx} y1={ys[0]} x2={lx} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={rx} y1={ys[0]} x2={rx} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    {/* AC接続 */}
    <line x1={acX} y1={acY-20} x2={acX} y2={ys[0]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={acX} y1={ys[0]} x2={lx} y2={ys[0]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={acX} y1={acY+20} x2={acX} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={acX} y1={ys[ys.length-1]} x2={lx} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    {/* 右側リターン */}
    <line x1={rx} y1={ys[0]} x2={rx+30} y2={ys[0]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={rx+30} y1={ys[0]} x2={rx+30} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    <line x1={rx+30} y1={ys[ys.length-1]} x2={rx} y2={ys[ys.length-1]} stroke={wireColor} strokeWidth="1.5" />
    <ACSrc cx={acX} cy={acY} isDark={isDark} />
    {/* 各枝 */}
    {branches.map((b, i) => {
      const y = ys[i], iV = Math.sin(phaseAngle + b.phase), iM = Math.abs(iV), iD = iV >= 0 ? 1 : -1;
      return <g key={b.key}>
        <line x1={lx} y1={y} x2={rx} y2={y} stroke={wireColor} strokeWidth="1.5" />
        <b.Comp x={midX} y={y} />
        <IArr x={lx+30} y={y} dir={iD} mag={iM} />
        <IArr x={rx-30} y={y} dir={iD} mag={iM} />
        {showMeters && <Meter x={midX+45} y={y} label="A" color={CL[b.key]} isDark={isDark} />}
      </g>;
    })}
    {showMeters && <Meter x={rx+30+15} y={(ys[0]+ys[ys.length-1])/2} label="V" color={CL.V} isDark={isDark} />}
  </g>;
}

export default function CircuitView({ circuitMode, enabled, phaseAngle, showMeters = false, showBar = false, isDark = true }) {
  const iNorm = Math.sin(phaseAngle);
  return (
    <svg viewBox="0 0 480 170" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="476" height="166" rx="8" fill={isDark ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.6)"} stroke={isDark ? "rgba(100,116,139,0.15)" : "rgba(148,163,184,0.4)"} />
      <text x="240" y="16" textAnchor="middle" fill={isDark ? "#64748b" : "#475569"} fontSize="10" fontWeight="500">
        {circuitMode === 'series' ? '直列回路' : '並列回路'}
      </text>
      {circuitMode === 'series'
        ? <Series enabled={enabled} iNorm={iNorm} showMeters={showMeters} showBar={showBar} isDark={isDark} />
        : <Parallel enabled={enabled} phaseAngle={phaseAngle} showMeters={showMeters} isDark={isDark} />}
    </svg>
  );
}
