// Pure chess logic and the badhri search. No DOM, no side effects.
// Board is a flat 64-array, index 0 = a8 (top-left), 63 = h1. Pieces are
// FEN chars: uppercase White, lowercase Black, null empty.
//
// State: { board, turn, castling, ep, half, full }
//   turn      "w" | "b"
//   castling  { wk, wq, bk, bq }  — rights still available
//   ep        en-passant target square, or null
//   half      halfmove clock (for the fifty-move rule)
//
// Shape shared with the other games: newGame(), moves(state), apply(state, m).

export const YOU = "w";
export const BADHRI = "b";

const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN = [...BISHOP, ...ROOK];
const KING = [...BISHOP, ...ROOK];
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

export const colorOf = p => (p == null ? null : p === p.toUpperCase() ? "w" : "b");
const other = c => (c === "w" ? "b" : "w");

function initialBoard() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = new Array(64).fill(null);
  for (let c = 0; c < 8; c++) {
    board[c] = back[c];                    // black back rank
    board[8 + c] = "p";                    // black pawns
    board[48 + c] = "P";                   // white pawns
    board[56 + c] = back[c].toUpperCase();  // white back rank
  }
  return board;
}

export function newGame() {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: null,
    half: 0,
    full: 1
  };
}

export function kingSquare(board, color) {
  const sym = color === "w" ? "K" : "k";
  return board.indexOf(sym);
}

// Is `sq` attacked by any piece of colour `by`?
export function attacked(board, sq, by) {
  const r = sq >> 3, c = sq & 7;

  // Pawns: a `by` pawn sits one rank toward its own side of the target.
  const pr = by === "w" ? r + 1 : r - 1;
  const pSym = by === "w" ? "P" : "p";
  if (pr >= 0 && pr < 8) {
    if (c > 0 && board[pr * 8 + c - 1] === pSym) return true;
    if (c < 7 && board[pr * 8 + c + 1] === pSym) return true;
  }

  const nSym = by === "w" ? "N" : "n";
  for (const [dr, dc] of KNIGHT) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === nSym) return true;
  }

  const kSym = by === "w" ? "K" : "k";
  for (const [dr, dc] of KING) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === kSym) return true;
  }

  const bSym = by === "w" ? "B" : "b";
  const rSym = by === "w" ? "R" : "r";
  const qSym = by === "w" ? "Q" : "q";
  for (const [dr, dc] of BISHOP) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const t = board[nr * 8 + nc];
      if (t) { if (t === bSym || t === qSym) return true; break; }
      nr += dr; nc += dc;
    }
  }
  for (const [dr, dc] of ROOK) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const t = board[nr * 8 + nc];
      if (t) { if (t === rSym || t === qSym) return true; break; }
      nr += dr; nc += dc;
    }
  }
  return false;
}

export function inCheck(state) {
  return attacked(state.board, kingSquare(state.board, state.turn), other(state.turn));
}

// --- Pseudo-legal move generation (may leave own king in check) ---

function slideMoves(board, i, color, dirs, out) {
  const r = i >> 3, c = i & 7;
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const j = nr * 8 + nc;
      const t = board[j];
      if (!t) out.push({ from: i, to: j, flag: "" });
      else { if (colorOf(t) !== color) out.push({ from: i, to: j, flag: "", capture: true }); break; }
      nr += dr; nc += dc;
    }
  }
}

function stepMoves(board, i, color, dirs, out) {
  const r = i >> 3, c = i & 7;
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
    const j = nr * 8 + nc;
    const t = board[j];
    if (!t) out.push({ from: i, to: j, flag: "" });
    else if (colorOf(t) !== color) out.push({ from: i, to: j, flag: "", capture: true });
  }
}

function addPawn(from, to, capture, promo, out) {
  if (promo) for (const pc of ["q", "r", "b", "n"]) out.push({ from, to, flag: "", capture, promotion: pc });
  else out.push({ from, to, flag: "", capture });
}

function pawnMoves(state, i, out) {
  const { board, ep } = state;
  const color = colorOf(board[i]);
  const r = i >> 3, c = i & 7;
  const dir = color === "w" ? -1 : 1;
  const startR = color === "w" ? 6 : 1;
  const promoR = color === "w" ? 0 : 7;
  const fr = r + dir;

  if (!board[fr * 8 + c]) {
    addPawn(i, fr * 8 + c, false, fr === promoR, out);
    if (r === startR && !board[(r + 2 * dir) * 8 + c]) {
      out.push({ from: i, to: (r + 2 * dir) * 8 + c, flag: "double" });
    }
  }
  for (const dc of [-1, 1]) {
    const nc = c + dc;
    if (nc < 0 || nc > 7) continue;
    const j = fr * 8 + nc;
    const t = board[j];
    if (t && colorOf(t) !== color) addPawn(i, j, true, fr === promoR, out);
    else if (j === ep) out.push({ from: i, to: j, flag: "ep", capture: true });
  }
}

function castleMoves(state, i, out) {
  const { board, castling, turn } = state;
  const opp = other(turn);
  if (attacked(board, i, opp)) return; // never castle out of check

  if (turn === "w" && i === 60) {
    if (castling.wk && !board[61] && !board[62] &&
        !attacked(board, 61, opp) && !attacked(board, 62, opp))
      out.push({ from: 60, to: 62, flag: "ck" });
    if (castling.wq && !board[59] && !board[58] && !board[57] &&
        !attacked(board, 59, opp) && !attacked(board, 58, opp))
      out.push({ from: 60, to: 58, flag: "cq" });
  } else if (turn === "b" && i === 4) {
    if (castling.bk && !board[5] && !board[6] &&
        !attacked(board, 5, opp) && !attacked(board, 6, opp))
      out.push({ from: 4, to: 6, flag: "ck" });
    if (castling.bq && !board[3] && !board[2] && !board[1] &&
        !attacked(board, 3, opp) && !attacked(board, 2, opp))
      out.push({ from: 4, to: 2, flag: "cq" });
  }
}

function pseudo(state) {
  const { board, turn } = state;
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || colorOf(p) !== turn) continue;
    switch (p.toLowerCase()) {
      case "p": pawnMoves(state, i, out); break;
      case "n": stepMoves(board, i, turn, KNIGHT, out); break;
      case "b": slideMoves(board, i, turn, BISHOP, out); break;
      case "r": slideMoves(board, i, turn, ROOK, out); break;
      case "q": slideMoves(board, i, turn, QUEEN, out); break;
      case "k": stepMoves(board, i, turn, KING, out); castleMoves(state, i, out); break;
    }
  }
  return out;
}

export function apply(state, m) {
  const board = state.board.slice();
  const piece = board[m.from];
  const color = colorOf(piece);
  const type = piece.toLowerCase();
  const captured = board[m.to];
  const castling = { ...state.castling };
  let ep = null;
  let half = state.half + 1;

  board[m.to] = piece;
  board[m.from] = null;

  if (m.flag === "ep") { board[color === "w" ? m.to + 8 : m.to - 8] = null; }
  if (m.flag === "double") ep = (m.from + m.to) / 2;
  if (m.flag === "ck") { if (color === "w") { board[61] = board[63]; board[63] = null; } else { board[5] = board[7]; board[7] = null; } }
  if (m.flag === "cq") { if (color === "w") { board[59] = board[56]; board[56] = null; } else { board[3] = board[0]; board[0] = null; } }
  if (m.promotion) board[m.to] = color === "w" ? m.promotion.toUpperCase() : m.promotion;

  if (type === "k") { if (color === "w") { castling.wk = castling.wq = false; } else { castling.bk = castling.bq = false; } }
  for (const sq of [m.from, m.to]) {
    if (sq === 63) castling.wk = false;
    else if (sq === 56) castling.wq = false;
    else if (sq === 7) castling.bk = false;
    else if (sq === 0) castling.bq = false;
  }

  if (type === "p" || captured || m.flag === "ep") half = 0;

  return {
    board,
    turn: other(color),
    castling,
    ep,
    half,
    full: state.full + (color === "b" ? 1 : 0)
  };
}

// Legal moves: pseudo-legal, minus any that leave the mover's king in check.
export function moves(state) {
  const turn = state.turn;
  const opp = other(turn);
  const res = [];
  for (const m of pseudo(state)) {
    const nx = apply(state, m);
    if (!attacked(nx.board, kingSquare(nx.board, turn), opp)) res.push(m);
  }
  return res;
}

export function insufficientMaterial(state) {
  const rest = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.toLowerCase() !== "k") rest.push({ t: p.toLowerCase(), i });
  }
  if (rest.some(x => "pqr".includes(x.t))) return false;
  if (rest.length <= 1) return true;                      // K(+minor) vs K
  if (rest.length === 2 && rest.every(x => x.t === "b")) { // KB vs KB, same colour
    const light = i => ((i >> 3) + (i & 7)) & 1;
    return light(rest[0].i) === light(rest[1].i);
  }
  return false;
}

// Compact key for threefold-repetition tracking.
export function positionKey(state) {
  const c = state.castling;
  return state.board.map(x => x || ".").join("") + state.turn +
    (c.wk ? "K" : "") + (c.wq ? "Q" : "") + (c.bk ? "k" : "") + (c.bq ? "q" : "") +
    (state.ep ?? "-");
}

// --- badhri: alpha-beta search with a quiescence tail ---

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables, White's view, index 0 = a8. Black reads them mirrored.
const PST = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20]
};

const MATE = 1000000;
const DEPTH = 3;

// Score from the side-to-move's point of view (negamax convention).
function evaluate(state) {
  let s = 0;
  const b = state.board;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    const v = VALUE[t] + PST[t][colorOf(p) === "w" ? i : i ^ 56];
    s += colorOf(p) === "w" ? v : -v;
  }
  return state.turn === "w" ? s : -s;
}

// Captures and promotions first (MVV-LVA), so alpha-beta prunes hard.
function ordered(ms, board) {
  const key = m => {
    let s = 0;
    if (m.capture) {
      const victim = m.flag === "ep" ? VALUE.p : VALUE[board[m.to].toLowerCase()];
      s += 10000 + victim * 10 - VALUE[board[m.from].toLowerCase()];
    }
    if (m.promotion) s += VALUE[m.promotion];
    return s;
  };
  return ms.slice().sort((a, b) => key(b) - key(a));
}

// Pseudo-legal captures and promotions only — the volatile moves quiescence
// resolves so the search never stops in the middle of a trade.
function loudMoves(state) {
  return pseudo(state).filter(m => m.capture || m.promotion);
}

// Search on past a leaf until the position is quiet, so tactics aren't missed
// at the horizon. Legality is checked per move; captures are cheap to vet.
function quiesce(state, alpha, beta) {
  const stand = evaluate(state);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const turn = state.turn, opp = other(turn);
  const board = state.board;
  for (const m of ordered(loudMoves(state), board)) {
    // Delta pruning: if even this capture plus a margin can't reach alpha, skip.
    const victim = m.capture ? (m.flag === "ep" ? VALUE.p : VALUE[board[m.to].toLowerCase()]) : 0;
    const gain = victim + (m.promotion ? VALUE[m.promotion] - VALUE.p : 0);
    if (stand + gain + 150 < alpha) continue;

    const nx = apply(state, m);
    if (attacked(nx.board, kingSquare(nx.board, turn), opp)) continue; // illegal
    const v = -quiesce(nx, -beta, -alpha);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(state, depth, alpha, beta, ply) {
  if (depth <= 0) return quiesce(state, alpha, beta);
  const ms = ordered(moves(state), state.board);
  if (ms.length === 0) return inCheck(state) ? -(MATE - ply) : 0;
  let best = -Infinity;
  for (const m of ms) {
    const v = -search(apply(state, m), depth - 1, -beta, -alpha, ply + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// Best move for the side to move. Standard alpha-beta at the root — alpha stays
// a clean integer so the window it feeds the tree is never corrupted. Root moves
// are shuffled first, so among equally good moves the tie breaks at random and
// badhri doesn't play an identical game every time.
export function badhri(state) {
  const ms = moves(state);
  if (ms.length === 0) return null;
  shuffle(ms);
  let best = ms[0], alpha = -Infinity;
  for (const m of ms) {
    const score = -search(apply(state, m), DEPTH - 1, -Infinity, -alpha, 1);
    if (score > alpha) { alpha = score; best = m; }
  }
  return best;
}
