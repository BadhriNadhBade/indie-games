import { SIZE, grid, spawn, newGame, slide, stuck } from "./engine.js";

const SLIDE = 110;      // must match --slide in game.css
const INVERT_AT = 128;  // value at which a tile flips to solid ink
const BEST_KEY = "games:2048:best";

const board = document.getElementById("board");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");
const overlaySub = document.getElementById("overlay-sub");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const liveEl = document.getElementById("live");
const readoutEl = document.getElementById("readout");
const undoBtn = document.getElementById("undo");

const nodes = new Map();
let state = newGame();
let history = [];
let best = load();
let busy = false;
let queued = null;
let over = false;
let celebrated = false;

function load() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function save(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* private mode or storage disabled — score just won't persist */
  }
}

for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.setProperty("--r", r);
    cell.style.setProperty("--c", c);
    board.appendChild(cell);
  }
}

function place(el, r, c) {
  el.style.setProperty("--r", r);
  el.style.setProperty("--c", c);
}

function paint(el, value) {
  el.textContent = value;
  el.dataset.len = String(value).length;
  el.classList.toggle("big", value >= INVERT_AT);
}

function makeTile(t) {
  const el = document.createElement("div");
  el.className = "tile";
  place(el, t.r, t.c);
  paint(el, t.value);
  board.appendChild(el);
  nodes.set(t.id, el);
  return el;
}

function rebuild() {
  for (const el of nodes.values()) el.remove();
  nodes.clear();
  for (const t of state.tiles) makeTile(t);
  sync();
}

function sync() {
  scoreEl.textContent = state.score;
  if (state.score > best) {
    best = state.score;
    save(best);
  }
  bestEl.textContent = best;
  undoBtn.disabled = history.length === 0;

  readoutEl.textContent =
    "Board: " +
    grid(state.tiles)
      .map((row, r) => "row " + (r + 1) + ", " + row.map(t => (t ? t.value : "empty")).join(", "))
      .join(". ") +
    ".";
}

function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 60);
}

function showOverlay(text, sub) {
  overlayText.textContent = text;
  overlaySub.textContent = sub;
  overlay.classList.add("shown");
}

const hideOverlay = () => overlay.classList.remove("shown");

function move(dir) {
  if (over) return;
  if (busy) { queued = dir; return; }

  const next = slide(state, dir);
  if (!next.moved) return;

  busy = true;
  history.push({ ...state, tiles: state.tiles.map(t => ({ ...t })) });
  if (history.length > 60) history.shift();

  const gained = next.score - state.score;

  // Phase 1 — everything slides. Values stay as they were.
  for (const t of next.tiles) place(nodes.get(t.id), t.r, t.c);
  for (const a of next.absorbed) {
    const el = nodes.get(a.id);
    el.classList.add("absorbed");
    place(el, a.r, a.c);
  }

  setTimeout(() => {
    // Phase 2 — absorbed tiles vanish, survivors take the doubled value.
    for (const a of next.absorbed) {
      nodes.get(a.id).remove();
      nodes.delete(a.id);
    }
    for (const t of next.tiles) {
      const el = nodes.get(t.id);
      if (Number(el.textContent) !== t.value) {
        paint(el, t.value);
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
    }

    state = { tiles: next.tiles, score: next.score, reached: next.reached };

    // Phase 3 — a new tile arrives.
    const fresh = spawn(state.tiles);
    if (fresh) {
      state.tiles.push(fresh);
      makeTile(fresh).classList.add("appear");
    }

    sync();
    if (gained) announce(gained + " points. Score " + state.score + ".");

    if (state.reached >= 2048 && !celebrated) {
      celebrated = true;
      showOverlay("2048.", "Keep going — press any key to dismiss.");
      announce("You reached 2048.");
    } else if (stuck(state.tiles)) {
      over = true;
      showOverlay("No moves left.", "Score " + state.score + ".");
      announce("Game over. Final score " + state.score + ".");
    }

    busy = false;
    if (queued) {
      const d = queued;
      queued = null;
      move(d);
    }
  }, SLIDE);
}

function restart() {
  state = newGame();
  history = [];
  over = celebrated = busy = false;
  queued = null;
  hideOverlay();
  rebuild();
  announce("New game.");
  board.focus();
}

function undo() {
  if (!history.length) return;
  state = history.pop();
  over = busy = false;
  queued = null;
  hideOverlay();
  rebuild();
  announce("Undone. Score " + state.score + ".");
}

const KEYS = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
  h: "left", l: "right", k: "up", j: "down"
};

const dismissible = () => celebrated && !over && overlay.classList.contains("shown");

window.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (dismissible()) hideOverlay();

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "r") { e.preventDefault(); restart(); return; }
  if (key === "u") { e.preventDefault(); undo(); return; }

  const dir = KEYS[key];
  if (dir) { e.preventDefault(); move(dir); }
});

let start = null;

board.addEventListener("pointerdown", e => {
  start = { x: e.clientX, y: e.clientY };
  board.setPointerCapture(e.pointerId);
});

board.addEventListener("pointerup", e => {
  if (!start) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  start = null;

  if (dismissible()) hideOverlay();
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;

  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});

board.addEventListener("pointercancel", () => { start = null; });
board.addEventListener("touchmove", e => e.preventDefault(), { passive: false });

document.getElementById("new").addEventListener("click", restart);
undoBtn.addEventListener("click", undo);

rebuild();
