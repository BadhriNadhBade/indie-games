// Pure game logic. No DOM, no side effects beyond the id counter.
// Every game in this repo implements the same shape:
//   newGame()            -> state
//   slide(state, move)   -> result  (what `apply` is called elsewhere)
//   stuck(state.tiles)   -> boolean

export const SIZE = 4;

let nextId = 1;

export function grid(tiles) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const t of tiles) g[t.r][t.c] = t;
  return g;
}

// Traversal orders, always running from the edge the tiles slide toward.
const LINES = {
  left:  Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, i) => [r, i])),
  right: Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, i) => [r, SIZE - 1 - i])),
  up:    Array.from({ length: SIZE }, (_, c) => Array.from({ length: SIZE }, (_, i) => [i, c])),
  down:  Array.from({ length: SIZE }, (_, c) => Array.from({ length: SIZE }, (_, i) => [SIZE - 1 - i, c]))
};

export function spawn(tiles) {
  const g = grid(tiles);
  const free = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!g[r][c]) free.push([r, c]);
    }
  }
  if (!free.length) return null;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  return { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, r, c };
}

export function newGame() {
  const tiles = [];
  tiles.push(spawn(tiles));
  tiles.push(spawn(tiles));
  return { tiles, score: 0, reached: 0 };
}

// Returns { tiles, score, reached, moved, absorbed }.
// `tiles` keep their ids so the renderer can animate them instead of
// tearing down and rebuilding the board.
// `absorbed` are the tiles that slide under a survivor and then vanish.
export function slide(state, dir) {
  const g = grid(state.tiles);
  const tiles = [];
  const absorbed = [];
  let score = state.score;
  let moved = false;

  for (const line of LINES[dir]) {
    const seq = line.map(([r, c]) => g[r][c]).filter(Boolean);
    const slots = [];

    for (let i = 0; i < seq.length; i++) {
      if (i + 1 < seq.length && seq[i].value === seq[i + 1].value) {
        slots.push({ keep: seq[i], gone: seq[i + 1], value: seq[i].value * 2 });
        score += seq[i].value * 2;
        i++;
      } else {
        slots.push({ keep: seq[i], gone: null, value: seq[i].value });
      }
    }

    slots.forEach((slot, i) => {
      const [r, c] = line[i];
      if (slot.keep.r !== r || slot.keep.c !== c || slot.gone) moved = true;
      tiles.push({ id: slot.keep.id, value: slot.value, r, c });
      if (slot.gone) absorbed.push({ id: slot.gone.id, r, c });
    });
  }

  const reached = tiles.reduce((m, t) => Math.max(m, t.value), state.reached);
  return { tiles, score, reached, moved, absorbed };
}

export function stuck(tiles) {
  if (tiles.length < SIZE * SIZE) return false;
  const g = grid(tiles);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = g[r][c].value;
      if (c + 1 < SIZE && g[r][c + 1].value === v) return false;
      if (r + 1 < SIZE && g[r + 1][c].value === v) return false;
    }
  }
  return true;
}
