// Pure game logic. No DOM, no side effects.
// Every game in this repo implements the same shape:
//   newGame()            -> state
//   apply(state, move)   -> new state, pure
//   legalMoves(state)    -> Move[]
//   stuck(state)         -> boolean
//
// A crossword has no opponent to search against, so there is nothing here for
// `badhri` to do: the answers are fixed, `apply` writes one letter into one
// square, and `stuck` means the grid is full. Everything else — where the
// cursor sits, which way it is pointing — is the renderer's business.

export const SIZE = 5;
const BLOCK = "#";

// Grids are five strings of five characters: a letter, or `#` for a block.
// Clues are keyed by the square number the entry starts on, which `layout`
// derives from the grid rather than the puzzle repeating it.
export const PUZZLES = [
  {
    grid: ["#LAP#",
           "TIDAL",
           "ABOVE",
           "BERET",
           "#LED#"],
    across: {
      1: "Circuit of a track",
      4: "Moved by the moon, as the sea",
      6: "Overhead",
      7: "Flat French cap",
      8: "Was out in front"
    },
    down: {
      1: "Defamation in print",
      2: "Love deeply",
      3: "Surfaced, as a road",
      4: "Browser strip, or a bar bill",
      5: "Allow"
    }
  },
  {
    grid: ["#ROT#",
           "TAPIR",
           "ENEMY",
           "AGREE",
           "#EAR#"],
    across: {
      1: "Go off, as fruit",
      4: "Snouted jungle grazer",
      6: "One you are up against",
      7: "Come to terms",
      8: "It catches sound"
    },
    down: {
      1: "Mountain chain, or a kitchen stove",
      2: "Drama that is sung throughout",
      3: "Kitchen countdown gadget",
      4: "Leaf steeped in hot water",
      5: "Whisky grain"
    }
  },
  {
    grid: ["##GET",
           "#FEAR",
           "PANSY",
           "EDIT#",
           "WEE##"],
    across: {
      1: "Come to have",
      4: "What courage works against",
      5: "Velvety garden flower",
      6: "Take a red pen to",
      7: "Very small"
    },
    down: {
      1: "Lamp dweller with three wishes",
      2: "Where the sun comes up",
      3: "Give it a go",
      4: "Lose colour",
      5: "Church bench"
    }
  },
  {
    grid: ["BIN##",
           "USER#",
           "GLEAN",
           "#EDGE",
           "##YEW"],
    across: {
      1: "Where the rubbish goes",
      4: "Whoever is at the keyboard",
      6: "Pick up bit by bit",
      8: "Border",
      9: "Churchyard evergreen"
    },
    down: {
      1: "Beetle, or a flaw in the code",
      2: "Small island",
      3: "Hard up",
      5: "Blind fury",
      7: "Fresh out of the box"
    }
  }
];

const layouts = [];

// Numbering, entries, and the two entries crossing each square — all derived
// from the grid, so a puzzle is only ever its letters and its clues.
export function layout(puzzle) {
  if (layouts[puzzle]) return layouts[puzzle];

  const p = PUZZLES[puzzle];
  const cells = p.grid.join("").split("");
  const blocks = cells.map(ch => ch === BLOCK);
  const numbers = Array(SIZE * SIZE).fill(0);
  const entries = [];
  const at = cells.map(() => ({ across: -1, down: -1 }));

  const open = i => i >= 0 && i < SIZE * SIZE && !blocks[i];

  let n = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (blocks[i]) continue;
    const r = Math.floor(i / SIZE), c = i % SIZE;

    // An entry starts where the run before it is cut off and the run after it
    // is at least two squares long — a lone square is nobody's answer.
    const startsAcross = (c === 0 || blocks[i - 1]) && c < SIZE - 1 && open(i + 1);
    const startsDown = (r === 0 || blocks[i - SIZE]) && r < SIZE - 1 && open(i + SIZE);
    if (!startsAcross && !startsDown) continue;

    numbers[i] = ++n;
    if (startsAcross) entries.push(entry(p, cells, blocks, i, n, "across", 1));
    if (startsDown) entries.push(entry(p, cells, blocks, i, n, "down", SIZE));
  }

  for (let e = 0; e < entries.length; e++) {
    for (const i of entries[e].cells) at[i][entries[e].dir] = e;
  }

  return (layouts[puzzle] = { blocks, numbers, entries, at });
}

function entry(p, cells, blocks, start, num, dir, step) {
  const list = [];
  const edge = dir === "across" ? i => i % SIZE === 0 : () => false;
  for (let i = start; i < SIZE * SIZE && !blocks[i]; i += step) {
    list.push(i);
    if (edge(i + step)) break;  // an across entry stops at the right-hand wall
  }
  return {
    dir,
    num,
    cells: list,
    answer: list.map(i => cells[i]).join(""),
    clue: p[dir][num] || ""
  };
}

export function newGame(puzzle = 0) {
  return { puzzle, letters: Array(SIZE * SIZE).fill("") };
}

// A move is { i, letter }; an empty letter erases. Blocks are never writable.
export function apply(state, move) {
  const { blocks } = layout(state.puzzle);
  if (blocks[move.i]) return state;
  const letters = state.letters.slice();
  letters[move.i] = move.letter;
  return { puzzle: state.puzzle, letters };
}

// The squares still waiting for a letter. Any of the 26 would be legal in each,
// so the move list is the squares themselves rather than every letter for every
// square.
export function legalMoves(state) {
  const { blocks } = layout(state.puzzle);
  const moves = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!blocks[i] && !state.letters[i]) moves.push({ i, letter: "" });
  }
  return moves;
}

export function stuck(state) {
  return legalMoves(state).length === 0;
}

// Squares holding a letter that isn't the one in the answer.
export function wrong(state) {
  const { blocks } = layout(state.puzzle);
  const answer = solution(state.puzzle);
  const bad = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const letter = state.letters[i];
    if (!blocks[i] && letter && letter !== answer[i]) bad.push(i);
  }
  return bad;
}

export function solved(state) {
  return stuck(state) && wrong(state).length === 0;
}

// The finished grid, block squares included, for revealing and for checking.
export function solution(puzzle) {
  return PUZZLES[puzzle].grid.join("").split("");
}
