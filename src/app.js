import { PUZZLES } from "./puzzles.js";

const COLORS = [
  "#fca5a5", "#fdba74", "#fde68a", "#86efac", "#67e8f9",
  "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#d9f99d",
  "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fecdd3", "#e2e8f0",
];

const boardEl = document.querySelector("#board");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");
const metaEl = document.querySelector("#meta");
const clearButton = document.querySelector("#clearButton");
const solutionButton = document.querySelector("#solutionButton");

let activePuzzle = PUZZLES[0];
let marks = [];
let showSolution = false;

function cellIndex(row, col, size = activePuzzle.size) {
  return row * size + col;
}

function solutionSet(puzzle) {
  return new Set([...puzzle.solution].map((v, i) => v === "Q" ? i : -1).filter(i => i >= 0));
}

function queenIndices() {
  return marks.map((state, i) => state === "q" ? i : -1).filter(i => i >= 0);
}

function getRegion(puzzle, idx) {
  return puzzle.regions[idx];
}

function validatePuzzleShape(puzzle) {
  const expected = puzzle.size * puzzle.size;
  if (puzzle.regions.length !== expected) throw new Error(`${puzzle.id}: regions length mismatch`);
  if (puzzle.solution.length !== expected) throw new Error(`${puzzle.id}: solution length mismatch`);
}

function populateSelect() {
  PUZZLES.forEach(validatePuzzleShape);
  selectEl.innerHTML = "";
  for (const puzzle of PUZZLES) {
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = `Day ${puzzle.day} · ${puzzle.size}×${puzzle.size}`;
    selectEl.append(option);
  }
}

function loadPuzzle(puzzleId) {
  activePuzzle = PUZZLES.find(p => p.id === puzzleId) ?? PUZZLES[0];
  marks = Array(activePuzzle.size * activePuzzle.size).fill("");
  showSolution = false;
  solutionButton.textContent = "Show solution";
  render();
}

function render() {
  const n = activePuzzle.size;
  boardEl.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.innerHTML = "";

  const errors = findErrors();
  const answer = solutionSet(activePuzzle);

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const idx = cellIndex(row, col, n);
      const regionId = getRegion(activePuzzle, idx);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.state = marks[idx];
      cell.dataset.index = idx;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `row ${row + 1}, column ${col + 1}, region ${regionId}`);
      cell.style.background = COLORS[regionCodeToNumber(regionId) % COLORS.length];
      cell.style.borderTopWidth = row === 0 || getRegion(activePuzzle, idx - n) !== regionId ? "3px" : "1px";
      cell.style.borderBottomWidth = row === n - 1 || getRegion(activePuzzle, idx + n) !== regionId ? "3px" : "1px";
      cell.style.borderLeftWidth = col === 0 || getRegion(activePuzzle, idx - 1) !== regionId ? "3px" : "1px";
      cell.style.borderRightWidth = col === n - 1 || getRegion(activePuzzle, idx + 1) !== regionId ? "3px" : "1px";

      if (errors.has(idx)) cell.classList.add("error");
      if (showSolution && answer.has(idx) && marks[idx] !== "q") cell.classList.add("solution");

      cell.addEventListener("click", () => {
        marks[idx] = nextState(marks[idx]);
        render();
      });

      boardEl.append(cell);
    }
  }

  renderStatus();
  metaEl.textContent = `${activePuzzle.source ?? "unknown source"} · ${activePuzzle.url ?? activePuzzle.id}`;
}

function regionCodeToNumber(code) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const found = alphabet.indexOf(code);
  return found >= 0 ? found : code.codePointAt(0);
}

function nextState(state) {
  if (state === "") return "x";
  if (state === "x") return "q";
  return "";
}

function findErrors() {
  const n = activePuzzle.size;
  const errors = new Set();
  const queens = queenIndices();

  const seenRows = new Map();
  const seenCols = new Map();
  const seenRegions = new Map();

  for (const idx of queens) {
    const row = Math.floor(idx / n);
    const col = idx % n;
    const region = getRegion(activePuzzle, idx);

    markDuplicate(seenRows, row, idx, errors);
    markDuplicate(seenCols, col, idx, errors);
    markDuplicate(seenRegions, region, idx, errors);
  }

  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i];
      const b = queens[j];
      const ar = Math.floor(a / n), ac = a % n;
      const br = Math.floor(b / n), bc = b % n;
      if (Math.max(Math.abs(ar - br), Math.abs(ac - bc)) <= 1) {
        errors.add(a);
        errors.add(b);
      }
    }
  }

  return errors;
}

function markDuplicate(map, key, idx, errors) {
  if (map.has(key)) {
    errors.add(map.get(key));
    errors.add(idx);
  } else {
    map.set(key, idx);
  }
}

function renderStatus() {
  const n = activePuzzle.size;
  const errors = findErrors();
  const queens = queenIndices();

  statusEl.className = "status";
  if (errors.size) {
    statusEl.classList.add("bad");
    statusEl.textContent = "Conflict: row, column, region, or adjacent queens.";
    return;
  }

  if (queens.length !== n) {
    statusEl.textContent = `${queens.length}/${n} queens placed`;
    return;
  }

  const answer = solutionSet(activePuzzle);
  const solved = queens.every(idx => answer.has(idx));
  if (solved) {
    statusEl.classList.add("ok");
    statusEl.textContent = "Solved.";
  } else {
    statusEl.classList.add("bad");
    statusEl.textContent = "Valid placement, but not the archived solution.";
  }
}

selectEl.addEventListener("change", () => loadPuzzle(selectEl.value));
clearButton.addEventListener("click", () => {
  marks = Array(activePuzzle.size * activePuzzle.size).fill("");
  render();
});
solutionButton.addEventListener("click", () => {
  showSolution = !showSolution;
  solutionButton.textContent = showSolution ? "Hide solution" : "Show solution";
  render();
});

populateSelect();
loadPuzzle(PUZZLES[0]?.id);
