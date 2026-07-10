import { PUZZLES } from "./puzzles.js";

const COLORS = ["#fca5a5", "#fdba74", "#fde68a", "#86efac", "#67e8f9", "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#d9f99d", "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fecdd3", "#e2e8f0"];
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STORAGE_KEY = "queens-archive-stats:v4";
const TRANSFORMS = [
  ["identity", (r, c) => [r, c]],
  ["rotate 90", (r, c, n) => [c, n - 1 - r]],
  ["rotate 180", (r, c, n) => [n - 1 - r, n - 1 - c]],
  ["rotate 270", (r, c, n) => [n - 1 - c, r]],
  ["mirror horizontal", (r, c, n) => [r, n - 1 - c]],
  ["mirror vertical", (r, c, n) => [n - 1 - r, c]],
  ["transpose", (r, c) => [c, r]],
  ["anti-transpose", (r, c, n) => [n - 1 - c, n - 1 - r]],
];

const $ = selector => document.querySelector(selector);
const boardEl = $("#board");
const selectEl = $("#puzzleSelect");
const randomSizeEl = $("#randomSize");
const randomButton = $("#randomButton");
const statusEl = $("#status");
const metaEl = $("#meta");
const statsEl = $("#stats");
const timerEl = $("#timer");
const ratingPanel = $("#ratingPanel");
const clearButton = $("#clearButton");
const checkButton = $("#checkButton");
const hintButton = $("#hintButton");
const solutionButton = $("#solutionButton");
const exportStatsButton = $("#exportStatsButton");

let activePuzzle = PUZZLES[0];
let marks = [];
let showSolution = false;
let checkMode = false;
let hint = null;
let hintCount = 0;
let solvedLogged = false;
let timerStartedAt = null;
let elapsed = 0;
let timerHandle = null;
let stats = loadStats();
let randomCounter = 0;
const easyPoolCache = new Map();

const rowOf = (index, size) => Math.floor(index / size);
const colOf = (index, size) => index % size;
const idxOf = (row, col, size) => row * size + col;
const queenIndices = (state = marks) => state.map((value, index) => value === "q" ? index : -1).filter(index => index >= 0);
const solutionSet = puzzle => new Set([...puzzle.solution].map((value, index) => value === "Q" ? index : -1).filter(index => index >= 0));
const unique = values => [...new Set(values)];

function populateSelect() {
  selectEl.innerHTML = "";
  for (const puzzle of PUZZLES) {
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = `Day ${puzzle.day} · ${puzzle.size}×${puzzle.size}`;
    selectEl.append(option);
  }
}

function loadPuzzle(puzzle, value = puzzle.id) {
  activePuzzle = puzzle;
  marks = Array(puzzle.size * puzzle.size).fill("");
  showSolution = false;
  checkMode = false;
  hint = null;
  hintCount = 0;
  solvedLogged = false;
  solutionButton.textContent = "Show solution";
  checkButton.textContent = "Check";
  resetTimer();
  if ([...selectEl.options].some(option => option.value === value)) selectEl.value = value;
  render();
}

function render() {
  const size = activePuzzle.size;
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  boardEl.innerHTML = "";
  const errors = findErrors(checkMode);
  const answer = solutionSet(activePuzzle);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = idxOf(row, col, size);
      const region = activePuzzle.regions[index];
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.state = marks[index];
      cell.style.background = COLORS[regionNumber(region) % COLORS.length];
      applyBorders(cell, row, col, index, region, size);
      if (errors.has(index)) cell.classList.add("error");
      if (hint?.target === index) {
        cell.classList.add("hint-target");
        cell.dataset.hintAction = hint.action;
      }
      if (hint?.causes?.includes(index)) cell.classList.add("hint-cause");
      if (showSolution && answer.has(index) && marks[index] !== "q") cell.classList.add("solution");
      cell.addEventListener("click", () => {
        startTimer();
        marks[index] = marks[index] === "" ? "x" : marks[index] === "x" ? "q" : "";
        hint = null;
        checkMode = false;
        render();
      });
      boardEl.append(cell);
    }
  }

  renderStatus();
  renderStats();
  renderRating();
  metaEl.textContent = metaText(activePuzzle);
}

function applyBorders(cell, row, col, index, region, size) {
  const thick = "4px";
  const thin = "1px";
  cell.style.borderTopWidth = row === 0 || activePuzzle.regions[index - size] !== region ? thick : thin;
  cell.style.borderBottomWidth = row === size - 1 || activePuzzle.regions[index + size] !== region ? thick : thin;
  cell.style.borderLeftWidth = col === 0 || activePuzzle.regions[index - 1] !== region ? thick : thin;
  cell.style.borderRightWidth = col === size - 1 || activePuzzle.regions[index + 1] !== region ? thick : thin;
}

function regionNumber(value) {
  const index = ALPHABET.indexOf(value);
  return index >= 0 ? index : value.codePointAt(0);
}

function metaText(puzzle) {
  const source = puzzle.source ?? "archive";
  const template = puzzle.templateDay ? ` · template day ${puzzle.templateDay}` : "";
  const transform = puzzle.transformName ? ` · ${puzzle.transformName}` : "";
  const path = puzzle.humanSteps ? ` · ${puzzle.humanSteps} basic steps` : "";
  return `${source}${template}${transform}${path}`;
}

function findErrors(checkSolution = false) {
  const size = activePuzzle.size;
  const queens = queenIndices();
  const bad = new Set();
  const rows = new Map();
  const cols = new Map();
  const regions = new Map();
  const answer = solutionSet(activePuzzle);
  for (const index of queens) {
    duplicate(rows, rowOf(index, size), index, bad);
    duplicate(cols, colOf(index, size), index, bad);
    duplicate(regions, activePuzzle.regions[index], index, bad);
    if (checkSolution && !answer.has(index)) bad.add(index);
  }
  for (let a = 0; a < queens.length; a++) {
    for (let b = a + 1; b < queens.length; b++) {
      if (Math.max(Math.abs(rowOf(queens[a], size) - rowOf(queens[b], size)), Math.abs(colOf(queens[a], size) - colOf(queens[b], size))) <= 1) {
        bad.add(queens[a]);
        bad.add(queens[b]);
      }
    }
  }
  if (checkSolution) for (const index of answer) if (marks[index] === "x") bad.add(index);
  return bad;
}

function duplicate(map, key, index, bad) {
  if (map.has(key)) {
    bad.add(map.get(key));
    bad.add(index);
  } else map.set(key, index);
}

function solved() {
  return isSolvedState(activePuzzle, marks);
}

function isSolvedState(puzzle, state) {
  const answer = solutionSet(puzzle);
  return state.every((value, index) => answer.has(index) ? value === "q" : value !== "q");
}

function renderStatus() {
  statusEl.className = "status";
  if (hint) {
    statusEl.innerHTML = `<span class="technique">${escapeHtml(hint.technique)}</span>${escapeHtml(hint.message)}`;
    return;
  }
  const errors = findErrors(false);
  if (errors.size) {
    statusEl.classList.add("bad");
    statusEl.textContent = "Conflict: queens share a row, column, region, or touch.";
    return;
  }
  if (checkMode && findErrors(true).size) {
    statusEl.classList.add("bad");
    statusEl.textContent = "Some marks contradict the stored solution.";
    return;
  }
  if (solved()) {
    statusEl.classList.add("ok");
    statusEl.textContent = `Solved in ${formatTime(currentMs())} · ${hintCount} hints`;
    finishSolve();
    return;
  }
  statusEl.textContent = `${queenIndices().length}/${activePuzzle.size} queens · ${hintCount} hints`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

// Normal mode deliberately stops at techniques a player can reasonably scan on a phone.
function nextHumanStep(puzzle, state) {
  return conflictStep(puzzle, state)
    || queenExclusionStep(puzzle, state)
    || singleStep(puzzle, state)
    || lockedCandidatesStep(puzzle, state)
    || null;
}

function conflictStep(puzzle, state) {
  const size = puzzle.size;
  const queens = queenIndices(state);
  for (let a = 0; a < queens.length; a++) {
    for (let b = a + 1; b < queens.length; b++) {
      const first = queens[a];
      const second = queens[b];
      if (rowOf(first, size) === rowOf(second, size)) return step("Conflict", second, "clear", [first], `Remove this queen: row ${rowOf(first, size) + 1} already has one.`);
      if (colOf(first, size) === colOf(second, size)) return step("Conflict", second, "clear", [first], `Remove this queen: column ${colOf(first, size) + 1} already has one.`);
      if (puzzle.regions[first] === puzzle.regions[second]) return step("Conflict", second, "clear", [first], "Remove this queen: its color region already has one.");
      if (Math.max(Math.abs(rowOf(first, size) - rowOf(second, size)), Math.abs(colOf(first, size) - colOf(second, size))) <= 1) return step("Touching queens", second, "clear", [first], "Remove this queen: queens may not touch, even diagonally.");
    }
  }
  return null;
}

function queenExclusionStep(puzzle, state) {
  for (const queen of queenIndices(state)) {
    for (let index = 0; index < state.length; index++) {
      if (state[index] !== "" || !attacks(puzzle, queen, index)) continue;
      const reason = rowOf(queen, puzzle.size) === rowOf(index, puzzle.size) ? `row ${rowOf(queen, puzzle.size) + 1}`
        : colOf(queen, puzzle.size) === colOf(index, puzzle.size) ? `column ${colOf(queen, puzzle.size) + 1}`
          : puzzle.regions[queen] === puzzle.regions[index] ? "the same color region"
            : "an adjacent square";
      return step("Queen exclusion", index, "x", [queen], `Put X here: the highlighted queen rules out ${reason}.`);
    }
  }
  return null;
}

function candidateSet(puzzle, state) {
  const queens = queenIndices(state);
  const candidates = new Set();
  for (let index = 0; index < state.length; index++) {
    if (state[index] === "x") continue;
    if (state[index] === "q" || queens.every(queen => !attacks(puzzle, queen, index))) candidates.add(index);
  }
  return candidates;
}

function units(puzzle) {
  const size = puzzle.size;
  const output = [];
  for (let row = 0; row < size; row++) output.push({ type: "row", key: row, label: `row ${row + 1}`, cells: [...Array(size)].map((_, col) => idxOf(row, col, size)) });
  for (let col = 0; col < size; col++) output.push({ type: "column", key: col, label: `column ${col + 1}`, cells: [...Array(size)].map((_, row) => idxOf(row, col, size)) });
  for (const region of unique([...puzzle.regions])) output.push({ type: "region", key: region, label: `${colorName(region)} region`, cells: [...puzzle.regions].map((value, index) => value === region ? index : -1).filter(index => index >= 0) });
  return output;
}

function colorName(region) {
  return `color ${regionNumber(region) + 1}`;
}

function singleStep(puzzle, state) {
  const candidates = candidateSet(puzzle, state);
  for (const unit of units(puzzle)) {
    if (unit.cells.some(index => state[index] === "q")) continue;
    const possible = unit.cells.filter(index => candidates.has(index));
    if (possible.length === 1) return step("Single candidate", possible[0], "q", possible, `Place a queen here: ${unit.label} has only one legal square left.`);
  }
  return null;
}

function lockedCandidatesStep(puzzle, state) {
  const candidates = candidateSet(puzzle, state);
  const allUnits = units(puzzle);
  for (const source of allUnits) {
    if (source.cells.some(index => state[index] === "q")) continue;
    const possible = source.cells.filter(index => candidates.has(index));
    if (possible.length < 2 || possible.length > 4) continue;
    for (const target of allUnits) {
      if (target.type === source.type || !possible.every(index => target.cells.includes(index))) continue;
      const elimination = target.cells.find(index => state[index] === "" && candidates.has(index) && !possible.includes(index));
      if (elimination != null) return step("Locked candidates", elimination, "x", possible, `All candidates for ${source.label} lie in ${target.label}; the rest of ${target.label} is excluded.`);
    }
  }
  return null;
}

function attacks(puzzle, first, second) {
  if (first === second) return false;
  const size = puzzle.size;
  return rowOf(first, size) === rowOf(second, size)
    || colOf(first, size) === colOf(second, size)
    || puzzle.regions[first] === puzzle.regions[second]
    || Math.max(Math.abs(rowOf(first, size) - rowOf(second, size)), Math.abs(colOf(first, size) - colOf(second, size))) <= 1;
}

function step(technique, target, action, causes, message) {
  return { technique, target, action, causes: unique(causes), message };
}

function applyHumanStep(state, deduction) {
  const next = [...state];
  if (deduction.action === "q") next[deduction.target] = "q";
  else if (deduction.action === "x") next[deduction.target] = "x";
  else if (deduction.action === "clear") next[deduction.target] = "";
  return next;
}

function humanSolveReport(puzzle) {
  let state = Array(puzzle.size * puzzle.size).fill("");
  const path = [];
  const answer = solutionSet(puzzle);
  const maxSteps = puzzle.size * puzzle.size * 3;
  for (let count = 0; count < maxSteps; count++) {
    if (isSolvedState(puzzle, state)) return { solved: true, path };
    const deduction = nextHumanStep(puzzle, state);
    if (!deduction || deduction.action === "clear") return { solved: false, path };
    if (deduction.action === "q" && !answer.has(deduction.target)) return { solved: false, path };
    if (deduction.action === "x" && answer.has(deduction.target)) return { solved: false, path };
    const next = applyHumanStep(state, deduction);
    if (next[deduction.target] === state[deduction.target]) return { solved: false, path };
    state = next;
    path.push(deduction);
  }
  return { solved: false, path };
}

function giveHint() {
  startTimer();
  checkMode = false;
  hint = nextHumanStep(activePuzzle, marks);
  if (!hint) {
    statusEl.className = "status bad";
    statusEl.innerHTML = '<span class="technique">No basic deduction</span>This archived board is outside the current basic hint set; no answer was revealed.';
    return;
  }
  hintCount++;
  render();
}

function transformPuzzle(base, humanSteps) {
  const size = base.size;
  const [name, transform] = TRANSFORMS[Math.floor(Math.random() * TRANSFORMS.length)];
  const regions = Array(size * size);
  const solution = Array(size * size).fill(".");
  for (let index = 0; index < size * size; index++) {
    const [row, col] = transform(rowOf(index, size), colOf(index, size), size);
    const target = idxOf(row, col, size);
    regions[target] = base.regions[index];
    if (base.solution[index] === "Q") solution[target] = "Q";
  }
  const labels = unique(regions);
  const shuffled = shuffle(ALPHABET.slice(0, labels.length).split(""));
  const map = new Map(labels.map((label, index) => [label, shuffled[index]]));
  return {
    id: `random-${size}-${Date.now()}-${++randomCounter}`,
    source: "basic archive shuffle",
    templateDay: base.day,
    transformName: name,
    humanSteps,
    size,
    regions: regions.map(label => map.get(label)).join(""),
    solution: solution.join(""),
    unique: true,
  };
}

function easyPool(size) {
  if (easyPoolCache.has(size)) return easyPoolCache.get(size);
  const accepted = [];
  for (const puzzle of PUZZLES.filter(item => item.size === size && item.unique !== false)) {
    const report = humanSolveReport(puzzle);
    if (report.solved) accepted.push({ puzzle, steps: report.path.length });
  }
  easyPoolCache.set(size, accepted);
  return accepted;
}

function createRandom(size) {
  const pool = easyPool(size);
  if (!pool.length) throw new Error(`No fully basic-solvable ${size}×${size} templates are loaded.`);
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return transformPuzzle(selected.puzzle, selected.steps);
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function startTimer() {
  if (solvedLogged || timerStartedAt != null) return;
  timerStartedAt = performance.now();
  timerHandle = setInterval(renderTimer, 250);
  renderTimer();
}
function stopTimer() {
  if (timerStartedAt == null) return;
  elapsed += performance.now() - timerStartedAt;
  timerStartedAt = null;
  clearInterval(timerHandle);
  timerHandle = null;
  renderTimer();
}
function resetTimer() {
  timerStartedAt = null;
  elapsed = 0;
  clearInterval(timerHandle);
  timerHandle = null;
  renderTimer();
}
function currentMs() {
  return elapsed + (timerStartedAt == null ? 0 : performance.now() - timerStartedAt);
}
function renderTimer() {
  timerEl.textContent = formatTime(currentMs());
}
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { sessions: [], puzzles: {} };
  } catch {
    return { sessions: [], puzzles: {} };
  }
}
function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}
function entry(id, create = true) {
  if (!stats.puzzles) stats.puzzles = {};
  if (!stats.puzzles[id] && create) stats.puzzles[id] = { solved: 0, best: null, playRating: null, visualRating: null };
  return stats.puzzles[id];
}
function finishSolve() {
  if (solvedLogged) return;
  solvedLogged = true;
  stopTimer();
  const data = entry(activePuzzle.id);
  data.solved++;
  data.best = data.best == null ? currentMs() : Math.min(data.best, currentMs());
  stats.sessions.push({ id: activePuzzle.id, at: new Date().toISOString(), ms: currentMs(), hints: hintCount });
  saveStats();
  renderRating();
}
function renderStats() {
  const data = entry(activePuzzle.id, false);
  statsEl.textContent = `Best: ${data?.best == null ? "—" : formatTime(data.best)} · solved: ${data?.solved ?? 0} · all solves: ${stats.sessions?.length ?? 0}`;
}
function renderRating() {
  const data = entry(activePuzzle.id, false);
  ratingPanel.hidden = !(solvedLogged || data);
  if (ratingPanel.hidden) return;
  const current = entry(activePuzzle.id);
  ratingPanel.innerHTML = "";
  ratingPanel.append(ratingRow("Play", current, "playRating"), ratingRow("Visual", current, "visualRating"));
}
function ratingRow(label, data, key) {
  const row = document.createElement("div");
  row.className = "rating-row";
  row.innerHTML = `<span>${label}</span>`;
  const stars = document.createElement("div");
  stars.className = "stars";
  for (let value = 1; value <= 5; value++) {
    const button = document.createElement("button");
    button.className = `star${value <= (data[key] ?? 0) ? " active" : ""}`;
    button.textContent = "★";
    button.onclick = () => {
      data[key] = value;
      saveStats();
      renderRating();
    };
    stars.append(button);
  }
  row.append(stars);
  return row;
}

selectEl.onchange = () => loadPuzzle(PUZZLES.find(puzzle => puzzle.id === selectEl.value) ?? PUZZLES[0]);
clearButton.onclick = () => loadPuzzle(activePuzzle, selectEl.value);
checkButton.onclick = () => {
  startTimer();
  checkMode = !checkMode;
  hint = null;
  checkButton.textContent = checkMode ? "Hide check" : "Check";
  render();
};
hintButton.onclick = giveHint;
solutionButton.onclick = () => {
  startTimer();
  showSolution = !showSolution;
  solutionButton.textContent = showSolution ? "Hide solution" : "Show solution";
  render();
};
randomButton.onclick = () => {
  randomButton.disabled = true;
  const previousText = randomButton.textContent;
  randomButton.textContent = "Filtering…";
  requestAnimationFrame(() => {
    try {
      const puzzle = createRandom(Number(randomSizeEl.value));
      const value = "__random__";
      let option = [...selectEl.options].find(item => item.value === value);
      if (!option) {
        option = document.createElement("option");
        option.value = value;
        selectEl.prepend(option);
      }
      option.textContent = `Random ${puzzle.size}×${puzzle.size} · day ${puzzle.templateDay}`;
      loadPuzzle(puzzle, value);
    } catch (error) {
      statusEl.className = "status bad";
      statusEl.textContent = error.message;
    } finally {
      randomButton.disabled = false;
      randomButton.textContent = previousText;
    }
  });
};
exportStatsButton.onclick = () => {
  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "queens-stats.json";
  anchor.click();
  URL.revokeObjectURL(url);
};

populateSelect();
loadPuzzle(PUZZLES[0]);
