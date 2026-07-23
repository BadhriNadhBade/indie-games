import { YOU, BADHRI, newGame, apply, stuck, winner, badhri } from "./engine.js";

const THINK = 380;  // pause before badhri answers, so its move reads as a move
const RECORD_KEY = "games:tic-tac-toe:record";

const NAMES = [
  "top left", "top", "top right",
  "left", "centre", "right",
  "bottom left", "bottom", "bottom right"
];

const MARK = {
  [YOU]: '<svg viewBox="0 0 100 100" aria-hidden="true">' +
         '<line x1="27" y1="27" x2="73" y2="73"/><line x1="73" y1="27" x2="27" y2="73"/></svg>',
  [BADHRI]: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="24"/></svg>'
};

const board = document.getElementById("board");
const statusEl = document.getElementById("status");
const drawnEl = document.getElementById("drawn");
const lostEl = document.getElementById("lost");
const liveEl = document.getElementById("live");
const readoutEl = document.getElementById("readout");

const squares = [];
let state = newGame();
let starter = YOU;   // flips every game so neither side always opens
let over = false;
let thinking = false;
let timer = null;
let record = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORD_KEY)) || {};
    return { drawn: Number(raw.drawn) || 0, lost: Number(raw.lost) || 0 };
  } catch {
    return { drawn: 0, lost: 0 };
  }
}

function save() {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    /* private mode or storage disabled — the record just won't persist */
  }
}

for (let i = 0; i < 9; i++) {
  const sq = document.createElement("button");
  sq.type = "button";
  sq.className = "sq";
  sq.addEventListener("click", () => play(i));
  board.appendChild(sq);
  squares.push(sq);
}

const describe = mark => (mark === YOU ? "your X" : mark === BADHRI ? "badhri's O" : "empty");

// `fresh` is the cell just filled, `line` the three to highlight on a win.
function render(fresh = -1, line = null) {
  state.cells.forEach((mark, i) => {
    const sq = squares[i];
    const playable = !mark && !over && !thinking && state.turn === YOU;

    sq.innerHTML = mark ? MARK[mark] : "";
    sq.setAttribute("aria-disabled", String(!playable));
    sq.setAttribute("aria-label", NAMES[i] + ", " + describe(mark));
    sq.classList.toggle("win", !!line && line.includes(i));
    sq.classList.toggle("fresh", i === fresh);
  });

  drawnEl.textContent = record.drawn;
  lostEl.textContent = record.lost;

  readoutEl.textContent = "Board: " + [0, 3, 6]
    .map(r => "row " + (r / 3 + 1) + ", " + state.cells.slice(r, r + 3).map(describe).join(", "))
    .join(". ") + ".";
}

function say(html) {
  statusEl.innerHTML = html;
}

function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 60);
}

// Returns true if the game just ended, so callers can stop.
function finish(fresh) {
  if (!stuck(state)) return false;

  over = true;
  const won = winner(state);

  if (won) {
    record.lost++;
    say("<b>badhri</b> wins.");
    announce("badhri wins.");
  } else {
    record.drawn++;
    say("Drawn — which is the best result there is against <b>badhri</b>.");
    announce("Drawn.");
  }

  save();
  render(fresh, won ? won.line : null);
  return true;
}

function play(i) {
  if (over || thinking || state.turn !== YOU || state.cells[i]) return;

  state = apply(state, i);
  if (finish(i)) return;

  thinking = true;
  render(i);
  say("<b>badhri</b> is thinking&hellip;");
  timer = setTimeout(respond, THINK);
}

function respond() {
  const move = badhri(state);
  thinking = false;
  if (move === null) return;

  state = apply(state, move);
  if (finish(move)) return;

  render(move);
  say("<b>badhri</b> took the " + NAMES[move] + ".<br>Your turn.");
  announce("badhri took the " + NAMES[move] + ". Your turn.");
}

function restart() {
  clearTimeout(timer);
  state = newGame(starter);
  starter = starter === YOU ? BADHRI : YOU;
  over = false;
  thinking = state.turn === BADHRI;

  render();

  if (thinking) {
    say("<b>badhri</b> opens&hellip;");
    timer = setTimeout(respond, THINK);
  } else {
    say("Your turn. You're <b>X</b>.");
  }
  announce("New game.");
}

// Arrow keys walk the grid; the squares are buttons, so Enter and Space
// already place a mark.
board.addEventListener("keydown", e => {
  const i = squares.indexOf(document.activeElement);
  if (i < 0) return;

  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
  if (!step) return;

  e.preventDefault();
  squares[(i + step + 9) % 9].focus();
});

window.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    restart();
  }
});

document.getElementById("new").addEventListener("click", restart);

restart();
