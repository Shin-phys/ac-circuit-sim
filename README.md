# 交流回路 位相差シミュレーター

高校物理の交流回路（RLC 直列・並列）で、電圧と電流の位相差をフェーザ図と波形で学ぶ Web アプリです。

公開ページ：https://shin-phys.github.io/ac-circuit-sim/

## 開発

```bash
npm install
npm run dev      # 開発用サーバー
npm run lint
npm run build    # docs/ に出力（GitHub Pages は main ブランチの docs/ を公開）
```

ソースを変えたら `npm run build` で docs/ を作り直し、src/ と docs/ を一緒にコミットしてください。

## ファイル構成
- `src/App.jsx` … 画面全体、物理計算、フェーザ図・波形
- `src/components/CircuitView.jsx` … 回路図
- `src/data/STEPS_DATA.js` … ステップ学習（16 ステップ）
- `src/data/CHALLENGE_DATA.js` … チャレンジの問題
- `public/` … favicon など（そのまま docs/ にコピーされる）
