// Pure game logic. No DOM, no side effects.
// Every game in this repo implements the same shape:
//   newGame()            -> state
//   apply(state, move)   -> new state, pure
//   legalMoves(state)    -> Move[]
//   stuck(state)         -> boolean
//
// `badhri` is the opponent, and it is nothing but a search over `apply` —
// which is the whole point of keeping `apply` pure and DOM-free.

export const YOU = "x";
export const BADHRI = "o";

// Indices into a flat 9-cell board.
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // columns
  [0, 4, 8], [2, 4, 6]              // diagonals
];

export function newGame(first = YOU) {
  return { cells: Array(9).fill(null), turn: first };
}

// Returns { mark, line } for a finished game, or null.
export function winner(state) {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = state.cells[a];
    if (mark && mark === state.cells[b] && mark === state.cells[c]) {
      return { mark, line };
    }
  }
  return null;
}

export function legalMoves(state) {
  if (winner(state)) return [];
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (!state.cells[i]) moves.push(i);
  }
  return moves;
}

export function apply(state, move) {
  const cells = state.cells.slice();
  cells[move] = state.turn;
  return { cells, turn: state.turn === YOU ? BADHRI : YOU };
}

// True once the game is over, whether by three in a row or a full board.
export function stuck(state) {
  return legalMoves(state).length === 0;
}

// badhri — the opponent.
//
// Tic-tac-toe has at most 9! reachable orderings, small enough to search to the
// end of the game on every turn, so badhri plays perfectly: it can't be beaten,
// and a draw is the best result available against it.
//
// Ties are broken at random. Perfect play is usually deterministic, which would
// make every game against the same opening identical; picking freely among
// equally-good moves keeps it varied without ever weakening the choice.
export function badhri(state) {
  const moves = legalMoves(state);
  if (!moves.length) return null;

  let best = -Infinity;
  let tied = [];

  for (const move of moves) {
    const score = -negamax(apply(state, move), 1);
    if (score > best) {
      best = score;
      tied = [move];
    } else if (score === best) {
      tied.push(move);
    }
  }

  return tied[Math.floor(Math.random() * tied.length)];
}

// Score a position from the point of view of whoever is to move in it.
//
// Depth is folded into the score so badhri wins as quickly as it can and loses
// as slowly as it can. Without that it treats every forced win as equal and
// will happily stall in a position it has already won.
function negamax(state, depth) {
  // A win on the board was created by the side that just moved, so it is a
  // loss for the side to move now.
  if (winner(state)) return depth - 10;

  const moves = legalMoves(state);
  if (!moves.length) return 0;  // full board, nobody won

  let best = -Infinity;
  for (const move of moves) {
    const score = -negamax(apply(state, move), depth + 1);
    if (score > best) best = score;
  }
  return best;
}
