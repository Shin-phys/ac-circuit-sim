// チャレンジモード問題生成
const V0 = 100;
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const randParams = () => ({ freq: randInt(20, 400), R: randInt(30, 300), LmH: randInt(30, 400), CuF: randInt(5, 80) });

// 位相関係の判定
function genPhase() {
  const cm = Math.random() > 0.5 ? 'series' : 'parallel';
  let params, phi;
  for (let i = 0; i < 50; i++) {
    params = randParams();
    const w = 2 * Math.PI * params.freq;
    const XL = w * params.LmH * 1e-3, XC = 1 / (w * params.CuF * 1e-6);
    if (cm === 'series') { phi = Math.atan2(XL - XC, params.R); }
    else { phi = Math.atan2(V0 * w * params.CuF * 1e-6 - V0 / (w * params.LmH * 1e-3), V0 / params.R); }
    if (Math.abs(phi) > 0.3) break;
  }
  let ci;
  if (Math.abs(phi) < 0.1) ci = 2;
  else if (cm === 'series') ci = phi > 0 ? 0 : 1;
  else ci = phi > 0 ? 1 : 0;
  return {
    type: 'choice', title: '位相関係を判定しよう',
    question: `この${cm === 'series' ? '直列' : '並列'}RLC回路の位相関係は？`,
    circuitMode: cm, params,
    options: ['電圧が電流より進んでいる（誘導性）', '電流が電圧より進んでいる（容量性）', '位相差はほぼ0（共振に近い）'],
    correctIndex: ci,
    explanation: ['X_L > X_C のため誘導性です', 'X_C > X_L のため容量性です', 'X_L ≈ X_C のため共振に近い状態です'][ci],
  };
}

// 共振周波数を見つける
function genResonance() {
  const cm = Math.random() > 0.5 ? 'series' : 'parallel';
  let params;
  let fRes;
  for (let i = 0; i < 50; i++) {
    params = { freq: randInt(20, 400), R: randInt(50, 200), LmH: randInt(50, 300), CuF: randInt(5, 60) };
    fRes = 1 / (2 * Math.PI * Math.sqrt(params.LmH * 1e-3 * params.CuF * 1e-6));
    if (fRes >= 15 && fRes <= 490) break;
  }
  return {
    type: 'resonance', title: '共振周波数を見つけよう',
    question: '周波数スライダーを動かして、位相差がほぼ0°になる共振状態を作ってください。',
    circuitMode: cm, params,
    targetFreq: fRes, tolerance: 0.08,
    explanation: `共振周波数は f₀ = 1/(2π√(LC)) = ${fRes.toFixed(1)} Hz です`,
  };
}

// パラメータ予測
function genPrediction() {
  const items = [
    { q: '周波数 f を大きくすると X_L は？', o: ['大きくなる','小さくなる','変わらない'], c: 0, e: 'X_L = 2πfL なので f↑ → X_L↑' },
    { q: '周波数 f を大きくすると X_C は？', o: ['大きくなる','小さくなる','変わらない'], c: 1, e: 'X_C = 1/(2πfC) なので f↑ → X_C↓' },
    { q: '抵抗 R を大きくすると |φ| は？', o: ['大きくなる','小さくなる','変わらない'], c: 1, e: 'φ = arctan((XL-XC)/R) の分母↑ → |φ|↓' },
    { q: '直列共振のとき電流 I₀ は？', o: ['最大になる','最小になる','変わらない'], c: 0, e: '共振時 Z = R（最小）→ I₀ = V₀/R（最大）' },
    { q: '並列共振のとき合成電流 I_total は？', o: ['最大になる','最小になる','I_R と等しい'], c: 2, e: 'I_L と I_C が打ち消し合い I_total = I_R' },
  ];
  const s = items[Math.floor(Math.random() * items.length)];
  return {
    type: 'choice', title: 'パラメータ変化を予測しよう',
    question: s.q, circuitMode: 'series', params: randParams(),
    options: s.o, correctIndex: s.c, explanation: s.e,
  };
}

export function generateChallenge() {
  const g = [genPhase, genResonance, genPrediction];
  return g[Math.floor(Math.random() * g.length)]();
}
