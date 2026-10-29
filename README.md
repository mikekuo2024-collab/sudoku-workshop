# 數獨工坊 Sudoku Workshop

瀏覽器數獨遊戲，出題流程參照 Sudoku+ 的演算法重新設計：回溯產生終盤、逐格挖洞並確認唯一解、依分支難度評級（簡單／中等／困難／專家），另有每日挑戰。

- 線上玩：https://mikekuo2024-collab.github.io/sudoku-workshop/
- `engine.js`：出題引擎
- `page.src.html`：頁面原始碼
- `build.py`：把引擎內嵌進頁面，產生 `docs/index.html`
