import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { STEPS } from './data/STEPS_DATA';
import { generateChallenge } from './data/CHALLENGE_DATA';
import CircuitView from './components/CircuitView';

// ===== 定数 =====
const V0 = 100;
const SVG_W = 960, SVG_H = 420;
const PH_CX = 175, PH_CY = 210, PH_R = 140;
const WV_X0 = 400, WV_X1 = 930, WV_CY = 210, WV_AMP = 140;
const WV_W = WV_X1 - WV_X0;
const CYCLES = 2, TOTAL_PH = CYCLES * 2 * Math.PI;
const COLORS = { I: '#22d3ee', V: '#f97316', R: '#4ade80', L: '#a78bfa', C: '#fb923c' };

// ===== ユーティリティ =====
const phPt = (cx, cy, a, r) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
const wavePath = (x0, w, cy, amp, po, tp) => {
  const N = 200; let d = '';
  for (let i = 0; i <= N; i++) {
    const x = x0 + (i / N) * w, y = cy - amp * Math.sin((i / N) * tp + po);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  } return d;
};

function Arrow({ x1, y1, x2, y2, color, width = 2.5, opacity = 1 }) {
  const a = Math.atan2(y2 - y1, x2 - x1), l = 10;
  return (<g opacity={opacity}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} />
    <polygon points={`${x2},${y2} ${x2 - l * Math.cos(a - 0.4)},${y2 - l * Math.sin(a - 0.4)} ${x2 - l * Math.cos(a + 0.4)},${y2 - l * Math.sin(a + 0.4)}`} fill={color} />
  </g>);
}

// 画面幅が狭い（スマホ縦）かどうか
function useIsNarrow(maxWidth = 767) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

// ===== メインコンポーネント =====
export default function App() {
  const isNarrow = useIsNarrow();
  const [isDark, setIsDark] = useState(true);
  const [mode, setMode] = useState('series');
  const [freq, setFreq] = useState(50);
  const [R, setR] = useState(40);
  const [LmH, setLmH] = useState(100);
  const [CuF, setCuF] = useState(30);
  const [showR, setShowR] = useState(false);
  const [showL, setShowL] = useState(false);
  const [showC, setShowC] = useState(false);
  const [showReactance, setShowReactance] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [hasR, setHasR] = useState(true);
  const [hasL, setHasL] = useState(true);
  const [hasC, setHasC] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSlow, setIsSlow] = useState(false);
  const [isScaleAuto, setIsScaleAuto] = useState(false); // 新規: スケール自動/固定
  const [phaseAngle, setPhaseAngle] = useState(0);
  const [demoState, setDemoState] = useState({ active: false, playing: false, startF: 10, endF: 100, isReverse: false }); // アニメーション用
  const animRef = useRef(null);

  // ステップ学習
  const [stepIndex, setStepIndex] = useState(0);
  // チャレンジ
  const [challenge, setChallenge] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const L = LmH * 1e-3;
  const Cval = CuF * 1e-6;

  // 回路モード（物理計算用）
  const circuitMode = useMemo(() => {
    if (mode === 'step') return STEPS[stepIndex]?.circuitMode || 'series';
    if (mode === 'challenge' && challenge) return challenge.circuitMode;
    return mode;
  }, [mode, stepIndex, challenge]);

  // ===== 物理計算 =====
  const physics = useMemo(() => {
    const omega = 2 * Math.PI * freq;
    const eR = hasR ? R : (circuitMode === 'series' ? 1e-10 : 1e10);
    const eL = hasL ? L : (circuitMode === 'series' ? 1e-10 : 1e10);
    const eC = hasC ? Cval : (circuitMode === 'series' ? 1e6 : 1e-16);
    const XL = omega * eL;
    const XC = omega * eC > 0 ? 1 / (omega * eC) : 1e10;
    if (circuitMode === 'series') {
      const Z = Math.sqrt(eR ** 2 + (XL - XC) ** 2);
      const I0 = V0 / Z;
      const phi = Math.atan2(XL - XC, eR);
      return { omega, XL, XC, Z, I0, phi, VR: I0 * eR, VL: I0 * XL, VC: I0 * XC };
    } else {
      const IR = V0 / eR, IL = V0 / (omega * eL), IC = V0 * omega * eC;
      const Itotal = Math.sqrt(IR ** 2 + (IC - IL) ** 2);
      const phi = Math.atan2(IC - IL, IR);
      return { omega, XL, XC, IR, IL, IC, Itotal, phi };
    }
  }, [circuitMode, freq, R, L, Cval, hasR, hasL, hasC]);

  // ===== アニメーション =====
  useEffect(() => {
    let lastTime = performance.now();
    const anim = (ts) => {
      const dt = ts - lastTime;
      lastTime = ts;

      // フェーザ回転 (通常約5秒で1周するためには速度=1.2程度)
      if (isPlaying) {
        const spd = isSlow ? 0.5 : 1.25;
        setPhaseAngle(p => p + spd * dt / 1000);
      }

      // デモ(共振スライダー)のアニメーション
      setDemoState(ds => {
        if (!ds.active || !ds.playing) return ds;
        setFreq(curr => {
          const demoSpd = 15; // Hz per second
          const next = curr + (ds.isReverse ? -1 : 1) * demoSpd * (dt / 1000);
          if (!ds.isReverse && next >= ds.endF) return ds.endF;
          if (ds.isReverse && next <= ds.endF) return ds.endF;
          return next;
        });
        return ds;
      });

      animRef.current = requestAnimationFrame(anim);
    };
    animRef.current = requestAnimationFrame(anim);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, isSlow]);

  // ===== モード切替 =====
  const applyStep = useCallback((idx) => {
    const s = STEPS[idx]; if (!s) return;
    setStepIndex(idx); setFreq(s.params.freq); setR(s.params.R);
    setLmH(s.params.LmH); setCuF(s.params.CuF);
    setHasR(s.enabled.R); setHasL(s.enabled.L); setHasC(s.enabled.C);
    setShowR(s.autoShow.includes('R')); setShowL(s.autoShow.includes('L')); setShowC(s.autoShow.includes('C'));
    setShowReactance(false); setShowSynthesis(false);
    if (s.forceSlow) setIsSlow(true);
    
    // デモ設定の初期化
    if (s.isDemo) {
      setDemoState({ active: true, playing: s.autoPlayDemo, startF: s.params.freq, endF: s.targetFreq, isReverse: s.params.freq > s.targetFreq });
      setIsScaleAuto(false); // 固定スケールを推奨
    } else {
      setDemoState({ active: false, playing: false });
    }
  }, []);

  const startChallenge = useCallback(() => {
    const q = generateChallenge(mode === 'challenge' ? (Math.random() > 0.5 ? 'series' : 'parallel') : mode);
    setChallenge(q); setSelectedAnswer(null); setIsAnswered(false);
    setFreq(q.params.freq); setR(q.params.R); setLmH(q.params.LmH); setCuF(q.params.CuF);
    // 問題の回路はすべての素子を使う（以前は enabled が無くてエラーになり、前のモードの ON/OFF が残っていた）
    const en = q.enabled ?? { R: true, L: true, C: true };
    setHasR(en.R); setHasL(en.L); setHasC(en.C);
    setShowR(false); setShowL(false); setShowC(false); setShowReactance(false); setShowSynthesis(false);
  }, [mode]);

  // パラメータリセット
  const resetParams = useCallback(() => {
    setFreq(50); setR(40); setLmH(100); setCuF(30);
  }, []);

  const switchMode = useCallback((m) => {
    setMode(m);
    if (m === 'step') applyStep(0);
    else if (m === 'challenge') startChallenge();
    else { setHasR(true); setHasL(true); setHasC(true); }
  }, [applyStep, startChallenge]);

  // 共振
  const resFreq = useMemo(() => L > 0 && Cval > 0 ? 1 / (2 * Math.PI * Math.sqrt(L * Cval)) : null, [L, Cval]);
  const setResonance = useCallback(() => { if (resFreq) setFreq(Math.min(500, Math.max(10, Math.round(resFreq)))); }, [resFreq]);
  const isRes = resFreq && Math.abs(freq - resFreq) / resFreq < 0.05;

  // チャレンジ回答
  const submitAnswer = useCallback((idx) => {
    if (isAnswered) return;
    setSelectedAnswer(idx); setIsAnswered(true);
    const correct = idx === challenge?.correctIndex;
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  }, [isAnswered, challenge]);

  const checkResonanceAnswer = useCallback(() => {
    if (!challenge || isAnswered) return;
    setIsAnswered(true);
    const ok = Math.abs(freq - challenge.targetFreq) / challenge.targetFreq < challenge.tolerance;
    setSelectedAnswer(ok ? 0 : -1);
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  }, [challenge, isAnswered, freq]);

  // ===== 説明テキスト =====
  const description = useMemo(() => {
    const { phi, XL, XC } = physics;
    const deg = Math.abs(phi * 180 / Math.PI);
    const lines = [];
    if (circuitMode === 'series') {
      if (isRes) { lines.push('✨ 共振状態：XL = XC、インピーダンス最小、電流最大'); lines.push('📐 位相差はほぼ0です'); }
      else if (XL > XC) { lines.push(`🔵 コイルの影響が強く、電圧は電流より ${deg.toFixed(0)}° 進んでいます`); }
      else { lines.push(`🟠 コンデンサの影響が強く、電流は電圧より ${deg.toFixed(0)}° 進んでいます`); }
    } else {
      const { IL, IC } = physics;
      if (isRes) { lines.push('✨ 共振状態：IL と IC が打ち消し合い I_total = I_R'); lines.push('📐 位相差はほぼ0です'); }
      else if (IC > IL) { lines.push(`🟠 コンデンサの影響が強く、電流は電圧より ${deg.toFixed(0)}° 進んでいます`); }
      else { lines.push(`🔵 コイルの影響が強く、電圧は電流より ${deg.toFixed(0)}° 進んでいます`); }
    }
    return lines;
  }, [physics, circuitMode, isRes]);

  // ===== 描画 =====
  // phi：直列は「電流に対する電圧の進み」、並列は「電圧に対する電流の進み」（フェーザ図の描画用）
  const { phi } = physics;
  // 表示する位相差は、直列・並列とも「電圧が電流より進む角」にそろえる（コイルが強いと正）
  const phiV = circuitMode === 'series' ? phi : -phi;
  const phiVDeg = (phiV * 180 / Math.PI).toFixed(1);
  const refColor = circuitMode === 'series' ? COLORS.I : COLORS.V;
  const resColor = circuitMode === 'series' ? COLORS.V : COLORS.I;
  const compVecs = useMemo(() => {
    // 基準スケール (固定の場合)
    const fixedScaleV = V0 * 2.5; // 直列では V0 の何倍までを枠に収めるか
    const fixedScaleI = V0 / 20;  // 並列では R=20Ω クラスの電流を基準に

    if (circuitMode === 'series') {
      const mx = isScaleAuto ? Math.max(V0, physics.VR || 0, physics.VL || 0, physics.VC || 0, 0.001) : fixedScaleV;
      return { mx, R: { amp: (physics.VR / mx) * PH_R, phase: 0 }, L: { amp: (physics.VL / mx) * PH_R, phase: Math.PI / 2 }, C: { amp: (physics.VC / mx) * PH_R, phase: -Math.PI / 2 } };
    } else {
      const mx = isScaleAuto ? Math.max(physics.Itotal || 0, physics.IR || 0, physics.IL || 0, physics.IC || 0, 0.001) : fixedScaleI;
      return { mx, R: { amp: ((physics.IR || 0) / mx) * PH_R, phase: 0 }, L: { amp: ((physics.IL || 0) / mx) * PH_R, phase: -Math.PI / 2 }, C: { amp: ((physics.IC || 0) / mx) * PH_R, phase: Math.PI / 2 } };
    }
  }, [physics, circuitMode, isScaleAuto]);

  // 基準ベクトル(ref)と合成ベクトル(res)の振幅計算
  // 直列: res=Voltage(固定V0), ref=Current(可変I0)
  // 並列: res=Current(可変Itotal), ref=Voltage(固定V0)
  // 直列の電流 I は電圧とは別の目盛りで描く（以前は 10 px ほどしかなく向きが読めなかった）
  //   固定：2.5 A（R = 40 Ω で共振したときの電流）を半径の 8 割に。はみ出す分は円の外側 1 割までで止める
  //   自動：いつも半径の 6 割
  const I_FULL = 2.5;
  const refAmp = circuitMode === 'series'
    ? (isScaleAuto ? PH_R * 0.6 : Math.min(PH_R * 1.1, (physics.I0 / I_FULL) * PH_R * 0.8))
    : PH_R * 0.8;                             // 並列での基準電圧は固定長で表示
  const resAmp = circuitMode === 'series' 
    ? (V0 / compVecs.mx) * PH_R 
    : ((physics.Itotal || 0) / compVecs.mx) * PH_R;

  const refTip = phPt(PH_CX, PH_CY, phaseAngle, refAmp);
  const resTip = phPt(PH_CX, PH_CY, phaseAngle + phi, resAmp);

  const curPhase = ((phaseAngle % TOTAL_PH) + TOTAL_PH) % TOTAL_PH;
  const markerX = WV_X0 + (curPhase / TOTAL_PH) * WV_W;
  const refWaveY = WV_CY - (refAmp / PH_R) * WV_AMP * Math.sin(phaseAngle);
  const resWaveY = WV_CY - (resAmp / PH_R) * WV_AMP * Math.sin(phaseAngle + phi);
  const refPath = wavePath(WV_X0, WV_W, WV_CY, (refAmp / PH_R) * WV_AMP, 0, TOTAL_PH);
  const resPath = wavePath(WV_X0, WV_W, WV_CY, (resAmp / PH_R) * WV_AMP, phi, TOTAL_PH);
  const phaseDeg = ((phaseAngle % (2 * Math.PI)) / (2 * Math.PI) * 360).toFixed(0);

  const activeComps = [];
  if (showR) activeComps.push({ key: 'R', color: COLORS.R, ...compVecs.R });
  if (showL) activeComps.push({ key: 'L', color: COLORS.L, ...compVecs.L });
  if (showC) activeComps.push({ key: 'C', color: COLORS.C, ...compVecs.C });

  const cLabels = circuitMode === 'series'
    ? { R: { v: 'V_R', w: 'v_R(t)' }, L: { v: 'V_L', w: 'v_L(t)' }, C: { v: 'V_C', w: 'v_C(t)' } }
    : { R: { v: 'I_R', w: 'i_R(t)' }, L: { v: 'I_L', w: 'i_L(t)' }, C: { v: 'I_C', w: 'i_C(t)' } };

  const isNormalMode = mode === 'series' || mode === 'parallel';
  const currentStep = mode === 'step' ? STEPS[stepIndex] : null;
  const stepView = currentStep?.view || 'graph';
  // 回路図表示条件: 通常モードは常に表示、ステップモードはviewで制御
  const showCircuit = isNormalMode || mode === 'challenge' || stepView === 'circuit' || stepView === 'both';
  const showGraph = isNormalMode || mode === 'challenge' || stepView === 'graph' || stepView === 'both';
  const circuitEnabled = { R: hasR, L: hasL, C: hasC };

  // ===== テーマ用スタイル =====
  const st = {
    main: isDark ? "from-slate-950 via-slate-900 to-gray-900 text-slate-200" : "from-slate-50 via-slate-100 to-slate-200 text-slate-800",
    header: isDark ? "border-slate-700/50 bg-slate-900/80" : "border-slate-300 bg-white/80",
    panel: isDark ? "bg-slate-800/60 border-slate-700/40" : "bg-white/80 border-slate-300 shadow-sm",
    canvas: isDark ? "bg-slate-800/40 border-slate-700/40" : "bg-slate-50/50 border-slate-300",
    title: isDark ? "text-slate-400" : "text-slate-500",
    text: isDark ? "text-slate-300" : "text-slate-600",
    muted: isDark ? "text-slate-500" : "text-slate-400",
    btnNav: isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 hover:text-slate-800",
    btnAction: isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-200 text-slate-700 hover:bg-slate-300",
    barBg: isDark ? "bg-slate-700" : "bg-slate-200"
  };

  // ===== レンダリング =====
  return (
    <div className={`${isDark ? 'dark' : 'light'} min-h-screen md:h-screen md:overflow-hidden bg-gradient-to-br ${st.main} flex flex-col font-sans select-none transition-colors duration-300`}>
      {/* ヘッダー */}
      <header className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b transition-colors ${st.header} backdrop-blur-sm`}>
        <h1 className="text-base font-bold tracking-wide bg-gradient-to-r from-cyan-400 to-orange-400 bg-clip-text text-transparent">
          交流回路 位相差シミュレーター
        </h1>
        <nav className="flex flex-wrap gap-2 items-center">
          {[{ key: 'series', label: '直列RLC' }, { key: 'parallel', label: '並列RLC' }, { key: 'step', label: 'ステップ学習' }, { key: 'challenge', label: 'チャレンジ' }].map(m => (
            <button key={m.key} onClick={() => switchMode(m.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-200 ${mode === m.key ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 border-transparent' : st.btnNav}`}>
              {m.label}
            </button>
          ))}
          <div className="w-px h-6 bg-slate-500/30 mx-1"></div>
          <button onClick={() => setIsDark(!isDark)}
            className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${st.btnNav}`} title="テーマ切替">
            {isDark ? '☀️' : '🌙'}
          </button>
        </nav>
      </header>

      <main className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3 md:overflow-hidden">
        {/* ===== 左パネル ===== */}
        <aside className="order-2 md:order-1 w-full md:w-64 flex-shrink-0 flex flex-col gap-2 md:overflow-y-auto">

          {/* --- パラメータ・スイッチ --- */}
          {isNormalMode && <>
            <div className={`${st.panel} backdrop-blur rounded-xl p-3 space-y-2.5 transition-colors`}>
              <div className="flex items-center justify-between mb-1">
                <h2 className={`text-xs font-semibold ${st.title} uppercase tracking-wider`}>パラメータ</h2>
                <button onClick={() => setIsScaleAuto(!isScaleAuto)} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${isScaleAuto ? 'bg-cyan-500 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>スケール: {isScaleAuto ? '自動' : '固定'}</button>
              </div>
              <Slider label="周波数 f" value={freq} onChange={setFreq} min={10} max={500} step={1} unit="Hz" isDark={isDark} />
              <Slider label="抵抗 R" value={R} onChange={setR} min={10} max={500} step={1} unit="Ω" isDark={isDark} />
              <Slider label="インダクタンス L" value={LmH} onChange={setLmH} min={10} max={500} step={1} unit="mH" isDark={isDark} />
              <Slider label="電気容量 C" value={CuF} onChange={setCuF} min={1} max={100} step={1} unit="μF" isDark={isDark} />
            </div>
            {isNormalMode && (
              <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
                <h2 className={`text-xs font-semibold ${st.title} uppercase tracking-wider mb-2`}>素子 ON/OFF・成分表示</h2>
                <div className="grid grid-cols-2 gap-x-1 gap-y-1.5">
                  <Toggle label={cLabels.R.v} sub="抵抗" checked={showR} onChange={setShowR} color={COLORS.R} isDark={isDark} />
                  <Toggle label={cLabels.L.v} sub="コイル" checked={showL} onChange={setShowL} color={COLORS.L} isDark={isDark} />
                  <Toggle label={cLabels.C.v} sub="コンデンサ" checked={showC} onChange={setShowC} color={COLORS.C} isDark={isDark} />
                  <Toggle label={circuitMode === 'series' ? 'V_L+V_C' : 'I_C+I_L'} sub="相殺" checked={showReactance} onChange={setShowReactance} color={isDark ? '#f472b6' : '#db2777'} isDark={isDark} />
                  <div className="col-span-2 pt-1 mt-0.5 border-t border-slate-500/30">
                    <Toggle label="合成" sub="幾何" checked={showSynthesis} onChange={setShowSynthesis} color={isDark ? '#e2e8f0' : '#475569'} isDark={isDark} />
                  </div>
                </div>
              </div>
            )}
          </>}

          {/* --- ステップ学習パネル --- */}
          {mode === 'step' && (() => { const s = STEPS[stepIndex]; return <>
            <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs ${st.muted}`}>{stepIndex + 1} / {STEPS.length}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>{s.circuitMode === 'series' ? '直列' : '並列'}</span>
              </div>
              <div className={`w-full ${st.barBg} rounded-full h-1 mb-2`}>
                <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1 rounded-full transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
              </div>
              {s.chapterTitle && <p className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'} font-semibold mb-1`}>{s.chapterTitle}</p>}
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'} mb-2`}>{s.title}</h3>
              {s.explanation.map((l, i) => <p key={i} className={`text-xs ${st.text} leading-relaxed mb-1`}>{l}</p>)}
              <div className={`mt-2 p-2 rounded-lg border ${isDark ? 'bg-amber-900/30 border-amber-700/30' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>💡 {s.keyPoint}</p>
              </div>
              
              {/* デモ用のアニメーション再生ボタン */}
              {demoState.active && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setDemoState(d => ({ ...d, playing: !d.playing }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${demoState.playing ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                    {demoState.playing ? '⏸ デモ停止' : '▶ デモ再生'}
                  </button>
                  <button onClick={() => { setFreq(demoState.startF); setDemoState(d => ({ ...d, playing: true })); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    🔄 リセット
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button disabled={stepIndex === 0} onClick={() => applyStep(stepIndex - 1)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${st.btnAction}`}>◀ 前へ</button>
              <button disabled={stepIndex >= STEPS.length - 1} onClick={() => applyStep(stepIndex + 1)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 disabled:opacity-30 transition-all">次へ ▶</button>
            </div>
            <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
              <h2 className={`text-xs font-semibold ${st.title} uppercase tracking-wider mb-1.5`}>成分表示</h2>
              <div className="grid grid-cols-2 gap-x-1 gap-y-1.5">
                {s.enabled.R && <Toggle label={s.circuitMode === 'series' ? 'V_R' : 'I_R'} sub="抵抗" checked={showR} onChange={setShowR} color={COLORS.R} isDark={isDark} />}
                {s.enabled.L && <Toggle label={s.circuitMode === 'series' ? 'V_L' : 'I_L'} sub="コイル" checked={showL} onChange={setShowL} color={COLORS.L} isDark={isDark} />}
                {s.enabled.C && <Toggle label={s.circuitMode === 'series' ? 'V_C' : 'I_C'} sub="コンデンサ" checked={showC} onChange={setShowC} color={COLORS.C} isDark={isDark} />}
                {(s.enabled.L && s.enabled.C) && <Toggle label={s.circuitMode === 'series' ? 'V_L+V_C' : 'I_C+I_L'} sub="相殺" checked={showReactance} onChange={setShowReactance} color={isDark ? '#f472b6' : '#db2777'} isDark={isDark} />}
                <div className="col-span-2 pt-1 mt-0.5 border-t border-slate-500/30">
                  <Toggle label="合成" sub="幾何" checked={showSynthesis} onChange={setShowSynthesis} color={isDark ? '#e2e8f0' : '#475569'} isDark={isDark} />
                </div>
              </div>
            </div>
          </>; })()}

          {/* --- チャレンジパネル --- */}
          {mode === 'challenge' && challenge && <>
            <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{challenge.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-cyan-900/50 text-cyan-300' : 'bg-cyan-100 text-cyan-700'}`}>
                  {score.correct}/{score.total}
                </span>
              </div>
              <p className={`text-xs ${st.text} mb-3 leading-relaxed`}>{challenge.question}</p>

              {/* 選択式問題 */}
              {challenge.type === 'choice' && (
                <div className="space-y-1.5">
                  {challenge.options.map((opt, i) => {
                    let cls = isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300';
                    if (isAnswered) {
                      if (i === challenge.correctIndex) cls = 'bg-green-500/20 text-green-400 border border-green-500/50';
                      else if (i === selectedAnswer) cls = 'bg-red-500/20 text-red-400 border border-red-500/50';
                      else cls = 'opacity-30 bg-slate-800 text-slate-500';
                      if (!isDark && i === challenge.correctIndex) cls = 'bg-green-100 text-green-700 border border-green-400';
                      if (!isDark && i === selectedAnswer && i !== challenge.correctIndex) cls = 'bg-red-100 text-red-700 border border-red-400';
                    }
                    return (
                      <button key={i} disabled={isAnswered} onClick={() => submitAnswer(i)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${cls}`}>
                        {opt}
                        {isAnswered && i === challenge.correctIndex && <span className="float-right">✅</span>}
                        {isAnswered && i === selectedAnswer && i !== challenge.correctIndex && <span className="float-right">❌</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 共振探索問題 */}
              {challenge.type === 'resonance' && (
                <div className="space-y-3">
                  <Slider label="周波数 f を調整" value={freq} onChange={f => !isAnswered && setFreq(f)} min={10} max={500} step={1} unit="Hz" isDark={isDark} />
                  {!isAnswered ? (
                    <button onClick={checkResonanceAnswer}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-400 transition-all">回答する</button>
                  ) : (
                    <div className={`p-2 rounded-lg text-center font-bold text-xs border ${selectedAnswer === 0 ? (isDark ? 'bg-green-900/30 text-green-400 border-green-700/50' : 'bg-green-100 text-green-700 border-green-300') : (isDark ? 'bg-red-900/30 text-red-400 border-red-700/50' : 'bg-red-100 text-red-700 border-red-300')}`}>
                      {selectedAnswer === 0 ? '✅ 正解！共振状態です' : '❌ 不正解... もう少し調整が必要でした'}
                    </div>
                  )}
                </div>
              )}

              {/* 解説表示 */}
              {isAnswered && (
                <div className={`mt-3 p-2.5 rounded-lg border ${isDark ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-200'}`}>
                  <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>【解説】</p>
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'} leading-relaxed`}>{challenge.explanation}</p>
                </div>
              )}
            </div>
            {isAnswered && (
              <button onClick={startChallenge}
                className="w-full py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 transition-all shadow-lg shadow-cyan-500/20">
                🔄 次の問題へ
              </button>
            )}
          </>}

          {/* ===== 共通コントロール ===== */}
          <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-xs font-semibold ${st.title} uppercase tracking-wider`}>再生制御</h2>
              {mode !== 'step' && <button onClick={() => setIsScaleAuto(!isScaleAuto)} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${isScaleAuto ? 'bg-cyan-500 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>スケール: {isScaleAuto ? '自動' : '固定'}</button>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsPlaying(!isPlaying)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${isPlaying ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20' : st.btnAction}`}>
                {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
              </button>
              <button onClick={() => setIsSlow(!isSlow)}
                className={`w-14 py-1.5 rounded-lg text-xs font-bold transition-all ${isSlow ? 'bg-amber-600 text-white' : st.btnAction}`}>
                {isSlow ? '🐌 ON' : '🐢'}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-xs ${st.muted}`}>位相: {phaseDeg}°</span>
              <div className="flex-1 bg-slate-700 rounded-full h-1 relative opacity-50">
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full left-0 transition-all duration-75"
                  style={{ left: `${(curPhase / TOTAL_PH) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {isNormalMode && <button onClick={setResonance} disabled={!resFreq}
              className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all shadow-lg disabled:opacity-30 ${isRes ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-600/30' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-orange-600/20'}`}>
              {isRes ? '✅ 共振中' : '✨ 共振周波数に設定'}
              {resFreq && <span className="ml-1 text-xs opacity-70">({resFreq.toFixed(0)} Hz)</span>}
            </button>}
            
            {isNormalMode && <button onClick={resetParams}
              className="w-full py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
              🔄 パラメータを初期値にリセット
            </button>}
          </div>

          {/* 説明テキスト */}
          {isNormalMode && <div className={`${st.panel} backdrop-blur rounded-xl p-3 transition-colors`}>
            <h2 className={`text-xs font-semibold ${st.title} uppercase tracking-wider mb-1`}>状態説明</h2>
            {description.map((l, i) => <p key={i} className={`text-xs ${st.text} leading-relaxed`}>{l}</p>)}
          </div>}
        </aside>

        {/* ===== 右側キャンバス ===== */}
        <div className="order-1 md:order-2 flex-1 min-h-0 min-w-0 flex flex-col gap-2 md:overflow-hidden">
          {/* 回路図 */}
          {showCircuit && (
            <div className={`flex-shrink-0 ${st.canvas} backdrop-blur rounded-xl border p-1 transition-colors ${stepView === 'circuit' && mode === 'step' ? (isNarrow ? 'h-[240px]' : 'flex-1 min-h-0') : (isNarrow ? 'h-[150px]' : 'h-[160px]')}`}>
              <CircuitView circuitMode={circuitMode} enabled={circuitEnabled} phaseAngle={phaseAngle}
                showMeters={currentStep?.showMeters || false} showBar={currentStep?.showBar || false} isDark={isDark} />
            </div>
          )}
          {/* フェーザ図＋波形グラフ */}
          {showGraph && (
          <div className={`${isNarrow ? '' : 'flex-1 min-h-0'} ${st.canvas} backdrop-blur rounded-xl border p-2 flex items-center justify-center overflow-hidden transition-colors`}>
          {(() => {
            const phasorLayer = <>
            <rect x={20} y={20} width={320} height={380} rx={12} fill={isDark ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.7)"} stroke={isDark ? "rgba(100,116,139,0.2)" : "rgba(148,163,184,0.4)"} />
            <text x={PH_CX} y={38} textAnchor="middle" fill={isDark ? "#94a3b8" : "#475569"} fontSize="14" fontWeight="600">フェーザ図</text>
            {/* フェーザ図 */}
            <circle cx={PH_CX} cy={PH_CY} r={PH_R} fill="none" stroke={isDark ? "rgba(100,116,139,0.15)" : "rgba(148,163,184,0.3)"} strokeWidth="1" strokeDasharray="4 4" />
            <circle cx={PH_CX} cy={PH_CY} r={PH_R*0.5} fill="none" stroke={isDark ? "rgba(100,116,139,0.1)" : "rgba(148,163,184,0.2)"} strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={PH_CX-PH_R-15} y1={PH_CY} x2={PH_CX+PH_R+15} y2={PH_CY} stroke={isDark ? "rgba(100,116,139,0.25)" : "rgba(148,163,184,0.4)"} strokeWidth="0.5" />
            <line x1={PH_CX} y1={PH_CY-PH_R-15} x2={PH_CX} y2={PH_CY+PH_R+15} stroke={isDark ? "rgba(100,116,139,0.25)" : "rgba(148,163,184,0.4)"} strokeWidth="0.5" />

            {/* 合成ベクトルの補助線 */}
            {(showReactance || showSynthesis) && (() => {
              const pA = phaseAngle;
              const vR = { x: compVecs.R.amp * Math.cos(pA + compVecs.R.phase), y: -compVecs.R.amp * Math.sin(pA + compVecs.R.phase) };
              const vL = { x: compVecs.L.amp * Math.cos(pA + compVecs.L.phase), y: -compVecs.L.amp * Math.sin(pA + compVecs.L.phase) };
              const vC = { x: compVecs.C.amp * Math.cos(pA + compVecs.C.phase), y: -compVecs.C.amp * Math.sin(pA + compVecs.C.phase) };
              const vX = { x: vL.x + vC.x, y: vL.y + vC.y }; // リアクタンスの和
              const tipX = { x: PH_CX + vX.x, y: PH_CY + vX.y };
              const tipR = { x: PH_CX + vR.x, y: PH_CY + vR.y };
              const tipRes = { x: PH_CX + vR.x + vX.x, y: PH_CY + vR.y + vX.y };
              const synColor = isDark ? "rgba(244, 114, 182, 0.8)" : "rgba(219, 39, 119, 0.8)"; // ピンク系の色
              const synDash = isDark ? "rgba(226, 232, 240, 0.4)" : "rgba(71, 85, 105, 0.4)";

              return <g>
                {/* LとCの差し引きベクトル */}
                {showReactance && <>
                  <line x1={PH_CX} y1={PH_CY} x2={tipX.x} y2={tipX.y} stroke={synColor} strokeWidth="3" strokeDasharray="4 3" />
                  <circle cx={tipX.x} cy={tipX.y} r={3} fill={synColor} />
                </>}
                {/* 合成のための長方形（補助線） */}
                {showSynthesis && <>
                  <line x1={tipR.x} y1={tipR.y} x2={tipRes.x} y2={tipRes.y} stroke={synDash} strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1={tipX.x} y1={tipX.y} x2={tipRes.x} y2={tipRes.y} stroke={synDash} strokeWidth="1.5" strokeDasharray="4 4" />
                  {!showReactance && <line x1={PH_CX} y1={PH_CY} x2={tipX.x} y2={tipX.y} stroke={synDash} strokeWidth="1.5" strokeDasharray="4 4" />}
                </>}
              </g>;
            })()}

            {activeComps.map(c => {
              const tip = phPt(PH_CX, PH_CY, phaseAngle + c.phase, c.amp);
              return <g key={c.key}><Arrow x1={PH_CX} y1={PH_CY} x2={tip.x} y2={tip.y} color={c.color} width={2} opacity={0.75} />
                <text x={tip.x+6} y={tip.y-6} fill={c.color} fontSize="13" fontWeight="600" opacity="0.85">{cLabels[c.key].v}</text></g>;
            })}
            <Arrow x1={PH_CX} y1={PH_CY} x2={refTip.x} y2={refTip.y} color={refColor} width={2.5} />
            <text x={refTip.x+8} y={refTip.y-8} fill={refColor} fontSize="16" fontWeight="700">{circuitMode==='series'?'I':'V'}</text>
            <Arrow x1={PH_CX} y1={PH_CY} x2={resTip.x} y2={resTip.y} color={resColor} width={2.5} />
            <text x={resTip.x+8} y={resTip.y-8} fill={resColor} fontSize="16" fontWeight="700">{circuitMode==='series'?'V':'I'}</text>
            {Math.abs(phi) > 0.02 && <PhaseArc cx={PH_CX} cy={PH_CY} startAngle={phaseAngle} phi={phi} r={40} />}
            {/* 電流Iベクトル延長の点線 (フェーザ図用) */}
            {(() => {
              const iAngle = circuitMode === 'series' ? phaseAngle : phaseAngle + phi;
              const extTip = phPt(PH_CX, PH_CY, iAngle, PH_R);
              return <line x1={PH_CX} y1={PH_CY} x2={extTip.x} y2={extTip.y} stroke={COLORS.I} strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />;
            })()}
            </>;
            const waveLayer = <>
            <rect x={370} y={20} width={575} height={380} rx={12} fill={isDark ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.7)"} stroke={isDark ? "rgba(100,116,139,0.2)" : "rgba(148,163,184,0.4)"} />
            <text x={(WV_X0+WV_X1)/2} y={38} textAnchor="middle" fill={isDark ? "#94a3b8" : "#475569"} fontSize="14" fontWeight="600">波形グラフ</text>
            {/* --- 波形グラフ --- */}
            {/* 軸 */}
            <line x1={WV_X0-10} y1={WV_CY} x2={WV_X1} y2={WV_CY} stroke={isDark ? "rgba(100,116,139,0.3)" : "rgba(148,163,184,0.5)"} strokeWidth="1" />
            <line x1={WV_X0} y1={WV_CY-WV_AMP} x2={WV_X1} y2={WV_CY-WV_AMP} stroke={isDark ? "rgba(100,116,139,0.1)" : "rgba(148,163,184,0.2)"} strokeWidth="1" strokeDasharray="2 4" />
            <line x1={WV_X0} y1={WV_CY+WV_AMP} x2={WV_X1} y2={WV_CY+WV_AMP} stroke={isDark ? "rgba(100,116,139,0.1)" : "rgba(148,163,184,0.2)"} strokeWidth="1" strokeDasharray="2 4" />
            {[0, Math.PI, 2 * Math.PI, 3 * Math.PI, 4 * Math.PI].map((p, i) => (
              <text key={`lx${i}`} x={WV_X0 + p / TOTAL_PH * WV_W} y={WV_CY + WV_AMP + 20}
                fill={isDark ? "#64748b" : "#475569"} fontSize="12">{i === 0 ? '0' : i === 1 ? 'π' : i === 2 ? '2π' : i === 3 ? '3π' : '4π'}</text>
            ))}

            <defs><clipPath id="wc"><rect x={WV_X0} y={WV_CY-WV_AMP-5} width={WV_W} height={WV_AMP*2+10} /></clipPath></defs>
            <g clipPath="url(#wc)">
              {activeComps.map(c => <path key={`w${c.key}`} d={wavePath(WV_X0,WV_W,WV_CY,(c.amp/PH_R)*WV_AMP,c.phase,TOTAL_PH)} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.6" strokeDasharray="6 3" />)}
              <path d={refPath} fill="none" stroke={refColor} strokeWidth="2" opacity="0.85" />
              <path d={resPath} fill="none" stroke={resColor} strokeWidth="2" opacity="0.85" />
            </g>

            <line x1={markerX} y1={WV_CY-WV_AMP} x2={markerX} y2={WV_CY+WV_AMP} stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"} strokeWidth="1" strokeDasharray="4 2" />
            <circle cx={markerX} cy={refWaveY} r={4} fill={refColor} stroke="#0f172a" strokeWidth="1.5" />
            <circle cx={markerX} cy={resWaveY} r={4} fill={resColor} stroke="#0f172a" strokeWidth="1.5" />
            {activeComps.map(c => <circle key={`d${c.key}`} cx={markerX} cy={WV_CY-(c.amp/PH_R)*WV_AMP*Math.sin(phaseAngle+c.phase)} r={3} fill={c.color} stroke="#0f172a" strokeWidth="1" opacity="0.8" />)}
            <g transform="translate(380,392)">
              <rect x={0} y={-10} width={560} height={20} rx={4} fill={isDark ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)"} />
              <line x1={8} y1={0} x2={28} y2={0} stroke={refColor} strokeWidth="2" />
              <text x={32} y={4} fill={refColor} fontSize="12" fontWeight="500">{circuitMode==='series'?'電流 i(t)':'電圧 v(t)'}</text>
              <line x1={95} y1={0} x2={115} y2={0} stroke={resColor} strokeWidth="2" />
              <text x={119} y={4} fill={resColor} fontSize="12" fontWeight="500">{circuitMode==='series'?'合成電圧 v(t)':'合成電流 i(t)'}</text>
              {showR && <><line x1={210} y1={0} x2={230} y2={0} stroke={COLORS.R} strokeWidth="1.5" strokeDasharray="4 2" /><text x={234} y={4} fill={COLORS.R} fontSize="12">{cLabels.R.w}</text></>}
              {showL && <><line x1={300} y1={0} x2={320} y2={0} stroke={COLORS.L} strokeWidth="1.5" strokeDasharray="4 2" /><text x={324} y={4} fill={COLORS.L} fontSize="12">{cLabels.L.w}</text></>}
              {showC && <><line x1={390} y1={0} x2={410} y2={0} stroke={COLORS.C} strokeWidth="1.5" strokeDasharray="4 2" /><text x={414} y={4} fill={COLORS.C} fontSize="12">{cLabels.C.w}</text></>}
            </g>
            </>;
            // フェーザ図の矢印の先と波形の点を結ぶ補助線（横に並べたときだけ）
            const connectLayer = <>
            <line x1={refTip.x} y1={refTip.y} x2={markerX} y2={refWaveY} stroke={refColor} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
            <line x1={resTip.x} y1={resTip.y} x2={markerX} y2={resWaveY} stroke={resColor} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
            {activeComps.map(c => {
              const t = phPt(PH_CX,PH_CY,phaseAngle+c.phase,c.amp);
              return <line key={`p${c.key}`} x1={t.x} y1={t.y} x2={markerX} y2={WV_CY-(c.amp/PH_R)*WV_AMP*Math.sin(phaseAngle+c.phase)} stroke={c.color} strokeWidth="0.6" strokeDasharray="3 3" opacity="0.3" />;
            })}
            </>;
            if (isNarrow) {
              // スマホ：フェーザ図と波形グラフを縦に並べ、それぞれを画面幅いっぱいに描く
              return <div className="w-full flex flex-col gap-1">
                <svg viewBox="15 15 330 390" className="w-full max-w-[360px] mx-auto">{phasorLayer}</svg>
                <svg viewBox="365 15 585 390" className="w-full">{waveLayer}</svg>
              </div>;
            }
            return <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              {phasorLayer}{waveLayer}{connectLayer}
            </svg>;
          })()}
          </div>
          )}

          {/* 下部: 計算値パネル (全幅横配列レイアウト) */}
          <div className={`flex-shrink-0 ${st.panel} backdrop-blur rounded-xl px-4 py-2 text-xs transition-colors border-t-2 shadow-sm ${isDark ? 'border-t-slate-700' : 'border-t-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:border-r border-slate-500/30 md:pr-4">
                <h2 className={`text-xs font-bold ${st.title} tracking-widest`} title="電流・電圧は最大値。交流の電流計・電圧計が示す実効値は、最大値 ÷ √2">計算値<span className="font-normal text-xs ml-1">（最大値）</span></h2>
                <VR label="角周波数 ω" value={physics.omega.toFixed(1)} unit="rad/s" isDark={isDark} row />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:border-r border-slate-500/30 md:pr-4">
                <VR label="X_L" value={physics.XL.toFixed(1)} unit="Ω" isDark={isDark} row />
                <VR label="X_C" value={physics.XC.toFixed(1)} unit="Ω" isDark={isDark} row />
                <VR label="インピーダンス Z" value={circuitMode==='series'?physics.Z.toFixed(1):(V0 / (physics.Itotal || 1e-10)).toFixed(1)} unit="Ω" isDark={isDark} row highlight={isRes} />
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
              {circuitMode === 'series' ? <>
                <VR label="全電流 I₀" value={physics.I0.toFixed(2)} unit="A" isDark={isDark} row highlight={isRes} />
                {showR && <VR label="V_R" value={physics.VR.toFixed(1)} unit="V" color={COLORS.R} isDark={isDark} row />}
                {showL && <VR label="V_L" value={physics.VL.toFixed(1)} unit="V" color={COLORS.L} isDark={isDark} row />}
                {showC && <VR label="V_C" value={physics.VC.toFixed(1)} unit="V" color={COLORS.C} isDark={isDark} row />}
              </> : <>
                <VR label="全電流 I_tot" value={(physics.Itotal||0).toFixed(2)} unit="A" isDark={isDark} row highlight={isRes} />
                <VR label="I_R" value={(physics.IR||0).toFixed(2)} unit="A" color={showR ? COLORS.R : undefined} isDark={isDark} row />
                <VR label="I_L" value={(physics.IL||0).toFixed(2)} unit="A" color={showL ? COLORS.L : undefined} isDark={isDark} row />
                <VR label="I_C" value={(physics.IC||0).toFixed(2)} unit="A" color={showC ? COLORS.C : undefined} isDark={isDark} row />
              </>}
              </div>
              
              <div className="flex items-center gap-2 md:pl-4 md:border-l border-slate-500/30">
                <VR label="位相差 φ" value={`${phiVDeg}°`} unit="（電圧の進み）" highlight isDark={isDark} row />
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className={`px-4 py-1.5 border-t text-center transition-colors ${isDark ? 'border-slate-700/50 bg-slate-900/80' : 'border-slate-300 bg-white/80'}`}>
        <span className={`text-xs ${st.muted}`}>
          V₀ = {V0} V（最大値）｜ {circuitMode === 'series' ? '直列' : '並列'}RLC ｜ φ = {phiVDeg}°（電圧が電流より進む角）
          {isRes && ' ｜ 🔔 共振状態'}
          {mode === 'step' && ` ｜ ${STEPS[stepIndex]?.title}`}
          {mode === 'challenge' && ` ｜ スコア: ${score.correct}/${score.total}`}
        </span>
      </footer>
    </div>
  );
}

// ===== サブコンポーネント =====
function Slider({ label, value, onChange, min = 0, max = 100, step = 1, unit = '', isDark }) {
  return (<div className="w-full">
    <div className="flex justify-between items-end mb-1">
      <label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>
      <span className="text-xs font-mono text-cyan-500">{value} <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{unit}</span></span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full" />
  </div>);
}

function Toggle({ label, sub, checked, onChange, color, isDark }) {
  return (<label className="flex items-center gap-2 cursor-pointer group">
    <div className={`w-4 h-4 min-w-[16px] rounded border-2 flex items-center justify-center transition-all ${checked ? 'border-transparent' : (isDark ? 'border-slate-600 group-hover:border-slate-400' : 'border-slate-300 group-hover:border-slate-500')}`}
      style={checked ? { backgroundColor: color, borderColor: color } : {}}>
      {checked && <span className="text-xs text-white font-bold">✓</span>}
    </div>
    <div className="flex flex-col truncate leading-tight">
      <span className="text-xs font-mono truncate" style={{ color: checked ? color : (isDark ? '#94a3b8' : '#64748b') }}>{label}</span>
      <span className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>({sub})</span>
    </div>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="hidden" />
  </label>);
}

function VR({ label, value, unit, highlight, color, isDark, row }) {
  const LabelClr = color ? color : (isDark ? "text-slate-400" : "text-slate-500");
  const ValClr = highlight ? (isDark ? 'text-amber-300 font-bold' : 'text-amber-600 font-bold') : (color ? color : (isDark ? 'text-slate-200 font-mono' : 'text-slate-700 font-mono'));
  
  if (row) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={LabelClr} style={color ? { color } : {}}>{label}</span>
        <span className={ValClr} style={color ? { color } : {}}>
          {value} {unit && <span className={isDark ? "text-slate-500 text-xs ml-0.5" : "text-slate-400 text-xs ml-0.5"}>{unit}</span>}
        </span>
      </div>
    );
  }
  
  return (<div className="flex justify-between items-center">
    <span className={LabelClr} style={color ? { color } : {}}>{label}</span>
    <span className={ValClr} style={color ? { color } : {}}>
      {value} {unit && <span className={isDark ? "text-slate-500 font-normal ml-0.5" : "text-slate-400 font-normal ml-0.5"}>{unit}</span>}
    </span>
  </div>);
}

function PhaseArc({ cx, cy, startAngle, phi, r }) {
  const ap = Math.abs(phi);
  let d = '';
  for (let i = 0; i <= 30; i++) {
    const a = startAngle + (i / 30) * phi;
    d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy - r * Math.sin(a)).toFixed(1);
  }
  return (<g>
    <path d={d} fill="none" stroke="rgba(250,204,21,0.5)" strokeWidth="1.5" />
    {ap > 0.1 && <text x={cx + (r + 14) * Math.cos(startAngle + phi / 2)} y={cy - (r + 14) * Math.sin(startAngle + phi / 2)}
      textAnchor="middle" fill="#fbbf24" fontSize="13" fontWeight="600">{(ap * 180 / Math.PI).toFixed(0)}°</text>}
  </g>);
}
