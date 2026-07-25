import {
  SIZE, PUZZLES, layout, newGame, apply, legalMoves, wrong, solved, solution
} from "./engine.js";

const SAVE_KEY = "games:crossword:save";
const CELLS = SIZE * SIZE;

const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const puzzleEl = document.getElementById("puzzle-no");
const filledEl = document.getElementById("filled");
const solvedEl = document.getElementById("solved");
const acrossEl = document.getElementById("across");
const downEl = document.getElementById("down");
const liveEl = document.getElementById("live");
const readoutEl = document.getElementById("readout");
const checkBtn = document.getElementById("check");
const revealBtn = document.getElementById("reveal");

const squares = [];   // the .sq wrappers, blocks included
const inputs = [];    // one per square; null on a block
const clueBtns = [];  // one per entry, indexed like layout().entries

let index = 0;        // which puzzle
let state, L;
let cursor = 0;
let dir = "across";
let checked = false;      // wrong squares are being marked
let given = new Set();    // squares filled in by Reveal
let helped = false;       // Reveal was used, so this one doesn't count as solved
let fresh = -1;           // square to flash on the next render
let note = "";            // second status line
let turning = false;      // a click landed on the square already under the cursor
let record = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    return {
      puzzle: within(s.puzzle),
      letters: Array.isArray(s.letters) ? s.letters : [],
      solved: Array.isArray(s.solved) ? s.solved : []
    };
  } catch {
    return { puzzle: 0, letters: [], solved: [] };
  }
}

function save() {
  record.puzzle = index;
  record.letters[index] = state.letters;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(record));
  } catch {
    /* private mode or storage disabled — progress just won't persist */
  }
}

function within(n) {
  n = Number(n);
  return Number.isInteger(n) && n >= 0 && n < PUZZLES.length ? n : 0;
}

// Stored letters can outlive an edit to the puzzles, so take only what still
// fits the grid in front of us.
function restore(puzzle) {
  const blocks = layout(puzzle).blocks;
  const kept = newGame(puzzle);
  const old = record.letters[puzzle];
  if (Array.isArray(old) && old.length === CELLS) {
    for (let i = 0; i < CELLS; i++) {
      const ch = String(old[i] || "").toUpperCase();
      if (!blocks[i] && /^[A-Z]$/.test(ch)) kept.letters[i] = ch;
    }
  }
  return kept;
}

/* ---- building the page ------------------------------------------------- */

function build() {
  L = layout(index);
  gridEl.replaceChildren();
  squares.length = 0;
  inputs.length = 0;

  for (let i = 0; i < CELLS; i++) {
    const sq = document.createElement("div");
    sq.className = "sq";
    squares.push(sq);
    gridEl.appendChild(sq);

    if (L.blocks[i]) {
      sq.classList.add("block");
      sq.setAttribute("aria-hidden", "true");
      inputs.push(null);
      continue;
    }

    if (L.numbers[i]) {
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = L.numbers[i];
      num.setAttribute("aria-hidden", "true");
      sq.appendChild(num);
    }

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 1;
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.addEventListener("input", () => onInput(i));
    input.addEventListener("focus", () => {
      input.select();  // a filled square has to be typed over, not appended to
      if (cursor !== i) { cursor = i; render(); }
    });
    // A tap on the square already under the cursor turns it, so the second tap
    // has to know where the cursor was before the focus handler moved it.
    input.addEventListener("pointerdown", () => {
      turning = cursor === i && document.activeElement === input;
    });
    input.addEventListener("click", () => {
      if (turning) { dir = other(dir); render(); }
      turning = false;
    });
    sq.appendChild(input);
    inputs.push(input);
  }

  buildClues();
}

function buildClues() {
  clueBtns.length = 0;
  acrossEl.replaceChildren();
  downEl.replaceChildren();

  L.entries.forEach((e, k) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "clue";

    const num = document.createElement("span");
    num.className = "n";
    num.textContent = e.num;
    const text = document.createElement("span");
    text.className = "t";
    text.textContent = e.clue;

    btn.append(num, text);
    btn.addEventListener("click", () => {
      dir = e.dir;
      cursor = firstGap(e);
      render();
      focusCursor();
    });

    li.appendChild(btn);
    (e.dir === "across" ? acrossEl : downEl).appendChild(li);
    clueBtns[k] = btn;
  });
}

/* ---- entries and the cursor -------------------------------------------- */

const other = d => (d === "across" ? "down" : "across");
const entryAt = (i, d = dir) => L.entries[L.at[i][d]];
const filled = e => e.cells.every(i => state.letters[i]);
const firstGap = e => e.cells.find(i => !state.letters[i]) ?? e.cells[0];

function focusCursor() {
  const input = inputs[cursor];
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

// Within the current entry: forward to the next gap, or just one square on.
function advance() {
  const cells = entryAt(cursor).cells;
  const rest = cells.slice(cells.indexOf(cursor) + 1);
  if (!rest.length) return;
  cursor = rest.find(i => !state.letters[i]) ?? rest[0];
}

function retreat() {
  const cells = entryAt(cursor).cells;
  const at = cells.indexOf(cursor);
  if (at > 0) cursor = cells[at - 1];
}

// Arrow keys: across the grain they turn the cursor, along it they walk.
function walk(dr, dc) {
  const want = dr ? "down" : "across";
  if (dir !== want) { dir = want; return; }
  let r = Math.floor(cursor / SIZE) + dr;
  let c = (cursor % SIZE) + dc;
  while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
    const i = r * SIZE + c;
    if (!L.blocks[i]) { cursor = i; return; }
    r += dr;
    c += dc;
  }
}

// Enter walks the clue list: all the acrosses, then all the downs.
function nextEntry(delta) {
  const order = L.entries
    .map((e, k) => k)
    .sort((a, b) => {
      const x = L.entries[a], y = L.entries[b];
      return x.dir === y.dir ? x.num - y.num : (x.dir === "across" ? -1 : 1);
    });
  const here = order.indexOf(L.at[cursor][dir]);
  const e = L.entries[order[(here + delta + order.length) % order.length]];
  dir = e.dir;
  cursor = firstGap(e);
}

/* ---- moves -------------------------------------------------------------- */

function type(ch) {
  state = apply(state, { i: cursor, letter: ch });
  given.delete(cursor);
  checked = false;
  note = "";
  fresh = cursor;
  save();

  if (solved(state)) finish();
  else advance();
  render();
}

function erase(back) {
  if (!state.letters[cursor] && back) retreat();
  state = apply(state, { i: cursor, letter: "" });
  given.delete(cursor);
  checked = false;
  note = "";
  save();
  render();
}

function finish() {
  if (helped) {
    note = "Filled in.";
    announce("The grid is filled in.");
    return;
  }
  if (!record.solved[index]) {
    record.solved[index] = true;
    save();
  }
  note = "<b>Solved.</b>";
  announce("Solved. The grid is complete and correct.");
}

function check() {
  const bad = wrong(state);
  checked = true;
  if (!bad.length) {
    const gaps = legalMoves(state).length;
    note = gaps ? "Right so far." : "";
    announce(gaps ? "Every letter so far is right." : "Everything is right.");
  } else {
    note = bad.length === 1 ? "One square is wrong." : bad.length + " squares are wrong.";
    announce(note);
  }
  render();
}

function reveal() {
  const answer = solution(index);
  for (let i = 0; i < CELLS; i++) {
    if (L.blocks[i] || state.letters[i] === answer[i]) continue;
    state = apply(state, { i, letter: answer[i] });
    given.add(i);
  }
  helped = true;
  checked = false;
  note = "Filled in.";
  save();
  render();
  announce("Answers revealed.");
}

function clear() {
  state = newGame(index);
  given.clear();
  helped = false;
  checked = false;
  note = "";
  cursor = firstGap(L.entries[0]);
  dir = "across";
  save();
  render();
  focusCursor();
  announce("Grid cleared.");
}

function open(next, initial = false) {
  index = within(next);
  build();
  state = restore(index);
  given.clear();
  helped = false;
  checked = false;
  note = "";
  dir = "across";
  cursor = firstGap(L.entries[0]);
  save();
  render();
  if (!initial) {
    focusCursor();
    announce("Puzzle " + (index + 1) + " of " + PUZZLES.length + ".");
  }
}

/* ---- rendering ---------------------------------------------------------- */

function render() {
  const entry = entryAt(cursor);
  const lit = new Set(entry.cells);
  const bad = checked ? new Set(wrong(state)) : new Set();
  const done = solved(state);

  for (let i = 0; i < CELLS; i++) {
    const sq = squares[i];
    if (L.blocks[i]) continue;
    const input = inputs[i];
    if (input.value !== state.letters[i]) input.value = state.letters[i];
    sq.classList.toggle("cur", i === cursor);
    sq.classList.toggle("word", lit.has(i) && i !== cursor);
    sq.classList.toggle("wrong", bad.has(i));
    sq.classList.toggle("given", given.has(i));
    sq.classList.toggle("fresh", i === fresh);
    input.setAttribute("aria-label", describe(i));
    input.tabIndex = i === cursor ? 0 : -1;
  }
  fresh = -1;

  gridEl.classList.toggle("done", done);
  L.entries.forEach((e, k) => {
    clueBtns[k].classList.toggle("here", e === entry);
    clueBtns[k].classList.toggle("filled", filled(e));
    clueBtns[k].setAttribute("aria-current", e === entry ? "true" : "false");
  });

  const gaps = legalMoves(state).length;
  const total = CELLS - L.blocks.filter(Boolean).length;
  puzzleEl.textContent = (index + 1) + "/" + PUZZLES.length;
  filledEl.textContent = (total - gaps) + "/" + total;
  solvedEl.textContent = record.solved.filter(Boolean).length;
  checkBtn.disabled = done;
  revealBtn.disabled = done;

  statusEl.innerHTML =
    "<b>" + entry.num + " " + entry.dir + "</b> &middot; " + entry.clue +
    " (" + entry.answer.length + ")" + (note ? "<br>" + note : "");

  readoutEl.textContent = rows();
}

// A square reads out as both of the answers it belongs to.
function describe(i) {
  const parts = [];
  for (const d of ["across", "down"]) {
    const e = entryAt(i, d);
    parts.push(e.num + " " + d + ", " + e.clue + ", letter " +
               (e.cells.indexOf(i) + 1) + " of " + e.cells.length);
  }
  return parts.join(". ") + ".";
}

function rows() {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      row.push(L.blocks[i] ? "block" : (state.letters[i] || "blank"));
    }
    out.push("Row " + (r + 1) + ": " + row.join(", ") + ".");
  }
  return out.join(" ");
}

function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 60);
}

/* ---- input -------------------------------------------------------------- */

// Letters are taken from keydown so a full square can be typed over. Soft
// keyboards that don't report keys fall through to `input` below.
gridEl.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    type(e.key.toUpperCase());
    focusCursor();
    return;
  }

  const arrows = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
  };

  if (arrows[e.key]) {
    e.preventDefault();
    walk(...arrows[e.key]);
    render();
    focusCursor();
  } else if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    erase(e.key === "Backspace");
    focusCursor();
  } else if (e.key === " ") {
    e.preventDefault();
    dir = other(dir);
    render();
    announce(entryAt(cursor).num + " " + dir + ". " + entryAt(cursor).clue + ".");
  } else if (e.key === "Enter") {
    // Tab is left alone: it is how a keyboard leaves the grid.
    e.preventDefault();
    nextEntry(e.shiftKey ? -1 : 1);
    render();
    focusCursor();
    announce(entryAt(cursor).num + " " + dir + ". " + entryAt(cursor).clue + ".");
  }
});

function onInput(i) {
  const input = inputs[i];
  const ch = input.value.slice(-1).toUpperCase();
  cursor = i;
  if (/^[A-Z]$/.test(ch)) {
    type(ch);
    focusCursor();
  } else if (input.value === "") {
    erase(false);
  } else {
    render();
  }
}

document.getElementById("next").addEventListener("click", () => open(index + 1 >= PUZZLES.length ? 0 : index + 1));
checkBtn.addEventListener("click", check);
revealBtn.addEventListener("click", reveal);
document.getElementById("clear").addEventListener("click", clear);

open(record.puzzle, true);
