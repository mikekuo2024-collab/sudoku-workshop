// Sudoku engine — a re-implementation of the logic recovered from Sudoku+ 2.4.0
// (SudokuGenerator / GeneratorStep), with the shuffle bias and time-seeded RNG fixed.
// Works as a classic script, a Web Worker, or a CommonJS module.
(function (root) {
  'use strict';

  // Region table, identical to the one at 0x1000fd3f8 in the original binary: the 9 boxes.
  const BOXES = [];
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3, box = [];
    for (let i = 0; i < 9; i++) box.push((r0 + Math.floor(i / 3)) * 9 + c0 + (i % 3));
    BOXES.push(box);
  }
  const ROW = i => Math.floor(i / 9), COL = i => i % 9;
  const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
    PEERS.push([...s]);
  }

  // Seedable PRNG (mulberry32). The original reseeded srand(time(0)) on every shuffle.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Unbiased Fisher–Yates. The original used j = i + rand() % (n-1-i), which never moves the last slot.
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function isSafe(g, i, d) {
    const p = PEERS[i];
    for (let k = 0; k < p.length; k++) if (g[p[k]] === d) return false;
    return true;
  }

  // +[SudokuGenerator isEffectiveRep:] — no duplicates in any box, row or column.
  function isEffective(g) {
    const groups = BOXES.concat(
      [...Array(9)].map((_, r) => [...Array(9)].map((_, c) => r * 9 + c)),
      [...Array(9)].map((_, c) => [...Array(9)].map((_, r) => r * 9 + c)));
    for (const grp of groups) {
      const seen = new Array(10).fill(false);
      for (const i of grp) { const v = g[i]; if (v) { if (seen[v]) return false; seen[v] = true; } }
    }
    return true;
  }

  // -[SudokuGenerator generate]: place digit 1 in each box, then 2, … with an explicit
  // stack of GeneratorStep objects; digit 9 fills whatever is left after 72 placements.
  function generateSolution(rand) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const g = new Array(81).fill(0);
      const stack = [];
      let step = 0, iter = 0;
      while (step < 72 && iter++ < 10000) {
        const digit = Math.floor(step / 9) + 1, box = step % 9;
        let top = stack[step];
        if (!top) {
          top = { positions: shuffle(BOXES[box].filter(i => g[i] === 0), rand), placed: -1 };
          stack[step] = top;
        }
        let ok = false;
        while (top.positions.length) {
          const pos = top.positions.pop();
          g[pos] = digit;
          if (isSafe(g, pos, digit)) { top.placed = pos; ok = true; break; }
          g[pos] = 0;
        }
        if (ok) { step++; continue; }
        stack.length = step;           // this step is exhausted: pop and undo the previous one
        step--;
        if (step < 0) break;
        g[stack[step].placed] = 0;
        stack[step].placed = -1;
      }
      if (step < 72) continue;
      for (let i = 0; i < 81; i++) if (!g[i]) g[i] = 9;
      if (isEffective(g)) return g;
    }
    throw new Error('solution generation failed');
  }

  // -[SudokuGenerator checkMathCount]: counts solutions, stopping at `limit`.
  // Same answer as the original; picks the most constrained cell instead of the first empty one for speed.
  function countSolutions(g, limit) {
    let count = 0;
    const work = g.slice();
    (function rec() {
      let best = -1, bestCands = null;
      for (let i = 0; i < 81; i++) {
        if (work[i]) continue;
        const c = [];
        for (let d = 1; d <= 9; d++) if (isSafe(work, i, d)) c.push(d);
        if (!bestCands || c.length < bestCands.length) { best = i; bestCands = c; if (c.length < 2) break; }
      }
      if (best < 0) { count++; return; }
      for (const d of bestCands) {
        work[best] = d; rec(); work[best] = 0;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  // -[SudokuGenerator generateVoidSudoku]: try removing every cell in random order,
  // keeping each removal only if the puzzle still has exactly one solution → minimal puzzle.
  function digHoles(solution, rand) {
    const g = solution.slice();
    const order = shuffle([...Array(81).keys()], rand);
    for (const p of order) {
      const saved = g[p];
      g[p] = 0;
      if (countSolutions(g, 2) !== 1) g[p] = saved;
    }
    return g;
  }

  // -[SudokuGenerator branchDifficulty]: repeatedly take the empty cell with the fewest
  // candidates (first one on ties), add (k-1)^2, and fill it with the true value.
  function branchDifficulty(puzzle, solution) {
    const g = puzzle.slice();
    let score = 0;
    for (;;) {
      let best = -1, bestK = 99, empties = 0;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        empties++;
        let k = 0;
        for (let d = 1; d <= 9; d++) if (isSafe(g, i, d)) k++;
        if (k < bestK) { bestK = k; best = i; }
      }
      if (best < 0) break;
      g[best] = solution[best];
      score += (bestK - 1) * (bestK - 1);
      if (empties === 1) break;
    }
    return score;
  }

  // -[SudokuGenerator calculateDifficultyIndex]
  function rate(puzzle, solution) {
    const B = branchDifficulty(puzzle, solution);
    const E = puzzle.filter(v => v === 0).length;
    return { branch: B, empty: E, index: B * 100 + E };
  }

  // Thresholds match the statistics queries in SKGameData (400 / 700 / 1000).
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];
  function levelOf(index) {
    return index < 400 ? 'easy' : index < 700 ? 'medium' : index < 1000 ? 'hard' : 'expert';
  }

  // -[SudokuGenerator generateGame], plus a retry loop until the rating lands in the wanted level.
  function generateGame(level, seed, maxTries) {
    const rand = rng(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    let best = null;
    for (let t = 0; t < (maxTries || 400); t++) {
      const solution = generateSolution(rand);
      const puzzle = digHoles(solution, rand);
      const r = rate(puzzle, solution);
      const game = { puzzle, solution, rating: r, level: levelOf(r.index), tries: t + 1 };
      if (!level || game.level === level) return game;
      // Keep the closest miss (by level distance) in case the budget runs out.
      const dist = Math.abs(LEVELS.indexOf(game.level) - LEVELS.indexOf(level));
      if (!best || dist < best.dist || (dist === best.dist && (LEVELS.indexOf(level) > LEVELS.indexOf(game.level) ? r.index > best.game.rating.index : r.index < best.game.rating.index)))
        best = { dist, game };
    }
    return best.game;
  }

  const api = { generateGame, generateSolution, digHoles, countSolutions, rate, levelOf, isSafe, isEffective, rng, shuffle, PEERS, LEVELS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SudokuEngine = api;

  // Worker mode: {level, seed} in, game out.
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = e => {
      const { id, level, seed } = e.data;
      try { root.postMessage({ id, game: generateGame(level, seed) }); }
      catch (err) { root.postMessage({ id, error: String(err) }); }
    };
  }
})(typeof self !== 'undefined' ? self : this);
