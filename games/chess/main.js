import {
  YOU, colorOf, newGame, moves, apply, badhri,
  inCheck, kingSquare, insufficientMaterial, positionKey
} from "./engine.js";

const THINK = 380;  // pause before badhri answers, so its move reads as a move
const RECORD_KEY = "games:chess:record";

const GLYPH = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟"
};
const NAME = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
const FILES = "abcdefgh";
const sqName = i => FILES[i & 7] + (8 - (i >> 3));
const pieceDesc = p => (colorOf(p) === "w" ? "white " : "black ") + NAME[p.toLowerCase()];

const board = document.getElementById("board");
const statusEl = document.getElementById("status");
const wonEl = document.getElementById("won");
const drawnEl = document.getElementById("drawn");
const lostEl = document.getElementById("lost");
const liveEl = document.getElementById("live");
const readoutEl = document.getElementById("readout");
const undoBtn = document.getElementById("undo");
const promoWrap = document.getElementById("promo-wrap");
const promoEl = document.getElementById("promo");

const cells = [];
const pieces = [];
let state = newGame();
let legal = moves(state);
let history = [];       // snapshots taken before each of your moves
let seen = new Map();   // position -> count, for threefold repetition
let selected = null;
let last = null;        // { from, to } of the move just played
let fresh = -1;         // square to flash on the next render
let over = false;
let thinking = false;
let timer = null;
let endMsg = "";
let record = load();

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(RECORD_KEY)) || {};
    return { won: Number(r.won) || 0, drawn: Number(r.drawn) || 0, lost: Number(r.lost) || 0 };
  } catch {
    return { won: 0, drawn: 0, lost: 0 };
  }
}

function save() {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    /* private mode or storage disabled — the record just won't persist */
  }
}

for (let i = 0; i < 64; i++) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "cell " + (((i >> 3) + (i & 7)) & 1 ? "dark" : "light");
  cell.addEventListener("click", () => tap(i));

  const piece = document.createElement("span");
  piece.className = "piece";
  cell.appendChild(piece);
  pieces.push(piece);

  const r = i >> 3, c = i & 7;
  if (c === 0) cell.appendChild(coord("rank", 8 - r));
  if (r === 7) cell.appendChild(coord("file", FILES[c]));

  board.appendChild(cell);
  cells.push(cell);
}

function coord(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  s.setAttribute("aria-hidden", "true");
  return s;
}

function bump() {
  const key = positionKey(state);
  seen.set(key, (seen.get(key) || 0) + 1);
}

function targetsFrom(from) {
  return legal.filter(m => m.from === from);
}

function render() {
  const yours = state.turn === YOU && !over;
  const marks = new Map();
  if (selected != null && yours) for (const m of targetsFrom(selected)) marks.set(m.to, !!m.capture);
  const checkSq = inCheck(state) ? kingSquare(state.board, state.turn) : -1;

  for (let i = 0; i < 64; i++) {
    const cell = cells[i];
    const p = state.board[i];
    pieces[i].textContent = p ? GLYPH[p] : "";
    cell.classList.toggle("sel", i === selected);
    cell.classList.toggle("check", i === checkSq);
    cell.classList.toggle("last", !!last && (i === last.from || i === last.to));
    cell.classList.toggle("move", marks.has(i) && !marks.get(i));
    cell.classList.toggle("cap", marks.get(i) === true);
    cell.classList.toggle("fresh", i === fresh);
    cell.setAttribute("aria-label", sqName(i) + ", " + (p ? pieceDesc(p) : "empty"));
  }
  fresh = -1;

  wonEl.textContent = record.won;
  drawnEl.textContent = record.drawn;
  lostEl.textContent = record.lost;
  undoBtn.disabled = !history.length;

  const white = [], black = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    (colorOf(p) === "w" ? white : black).push(NAME[p.toLowerCase()] + " " + sqName(i));
  }
  readoutEl.textContent = "White: " + white.join(", ") + ". Black: " + black.join(", ") + ".";
}

function say(html) { statusEl.innerHTML = html; }

function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 60);
}

function describe(m) {
  const type = state.board[m.from].toLowerCase();
  if (m.flag === "ck") return "castles kingside";
  if (m.flag === "cq") return "castles queenside";
  let s = NAME[type] + " " + sqName(m.from) + (m.capture ? " takes " : " to ") + sqName(m.to);
  if (m.promotion) s += ", promotes to " + NAME[m.promotion];
  return s;
}

// Ends the game if it is over. `mover` is who just moved. Returns true if ended.
function checkEnd(mover) {
  const youMoved = mover === "You";
  const reply = moves(state);

  if (reply.length === 0) {
    over = true;
    if (inCheck(state)) {
      if (youMoved) { record.won++; say("Checkmate &mdash; <b>you win</b>."); endMsg = "Checkmate. You win."; }
      else { record.lost++; say("Checkmate &mdash; <b>badhri wins</b>."); endMsg = "Checkmate. badhri wins."; }
    } else {
      record.drawn++; say("Stalemate &mdash; <b>draw</b>."); endMsg = "Stalemate. Draw.";
    }
  } else if (state.half >= 100) {
    over = true; record.drawn++; say("Draw &mdash; fifty-move rule."); endMsg = "Draw by the fifty-move rule.";
  } else if (insufficientMaterial(state)) {
    over = true; record.drawn++; say("Draw &mdash; insufficient material."); endMsg = "Draw by insufficient material.";
  } else if ((seen.get(positionKey(state)) || 0) >= 3) {
    over = true; record.drawn++; say("Draw &mdash; threefold repetition."); endMsg = "Draw by repetition.";
  }

  if (over) { save(); render(); }
  return over;
}

function tap(i) {
  if (over || thinking || state.turn !== YOU) return;
  const p = state.board[i];

  if (selected === i) { selected = null; render(); return; }
  if (selected != null) {
    const picks = targetsFrom(selected).filter(m => m.to === i);
    if (picks.length) { choose(picks); return; }
  }
  if (p && colorOf(p) === YOU) { selected = i; render(); return; }
  selected = null;
  render();
}

// One destination may carry several promotion moves — ask which piece.
function choose(picks) {
  if (picks.length === 1) { human(picks[0]); return; }
  promoEl.innerHTML = "";
  for (const m of picks) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = GLYPH[m.promotion.toUpperCase()];
    b.setAttribute("aria-label", "Promote to " + NAME[m.promotion]);
    b.addEventListener("click", () => human(m));
    promoEl.appendChild(b);
  }
  promoWrap.classList.add("shown");
  promoWrap.setAttribute("aria-hidden", "false");
  promoEl.firstChild.focus();
}

function hidePromo() {
  promoWrap.classList.remove("shown");
  promoWrap.setAttribute("aria-hidden", "true");
}

function human(m) {
  hidePromo();
  history.push({ state, last, seen: new Map(seen) });
  const desc = describe(m);

  state = apply(state, m);
  last = { from: m.from, to: m.to };
  fresh = m.to;
  selected = null;
  bump();

  if (checkEnd("You")) { announce("You played " + desc + ". " + endMsg); return; }

  thinking = true;
  say("<b>badhri</b> is thinking&hellip;");
  render();
  announce("You played " + desc + ".");
  timer = setTimeout(respond, THINK);
}

function respond() {
  const m = badhri(state);
  thinking = false;
  if (!m) { checkEnd("badhri"); return; }
  const desc = describe(m);

  state = apply(state, m);
  last = { from: m.from, to: m.to };
  fresh = m.to;
  legal = moves(state);
  bump();

  if (checkEnd("badhri")) { announce("badhri played " + desc + ". " + endMsg); return; }

  const check = inCheck(state) ? " <b>Check.</b>" : "";
  say("<b>badhri</b> played " + desc + "." + check + "<br>Your turn.");
  announce("badhri played " + desc + "." + (check ? " Check." : "") + " Your turn.");
  render();
}

function restart(initial = false) {
  clearTimeout(timer);
  state = newGame();
  legal = moves(state);
  history = [];
  seen = new Map();
  bump();
  selected = null;
  last = null;
  over = false;
  thinking = false;
  hidePromo();
  say("Your turn. You're <b>White</b>.");
  render();
  if (!initial) { announce("New game."); cells[52].focus(); }  // e2 — keyboard entry point
}

function undo() {
  if (!history.length) return;
  clearTimeout(timer);
  const snap = history.pop();
  state = snap.state;
  last = snap.last;
  seen = snap.seen;
  legal = moves(state);
  selected = null;
  over = false;
  thinking = false;
  hidePromo();
  say("Your turn. You're <b>White</b>.");
  render();
  announce("Move taken back.");
}

// Arrow keys walk the grid; squares are buttons, so Enter and Space act.
board.addEventListener("keydown", e => {
  const i = cells.indexOf(document.activeElement);
  if (i < 0) return;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[e.key];
  if (step === undefined) return;
  e.preventDefault();
  if (e.key === "ArrowLeft" && i % 8 === 0) return;
  if (e.key === "ArrowRight" && i % 8 === 7) return;
  const j = i + step;
  if (j >= 0 && j < 64) cells[j].focus();
});

window.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "r") { e.preventDefault(); restart(); return; }
  if (k === "u") { e.preventDefault(); undo(); return; }
  if (k === "Escape") { if (selected != null) { selected = null; render(); } hidePromo(); }
});

document.getElementById("new").addEventListener("click", () => restart());
undoBtn.addEventListener("click", undo);

restart(true);
