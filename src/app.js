import { PUZZLES } from "./puzzles.js";

const COLORS = [
  "#fca5a5", "#fdba74", "#fde68a", "#86efac", "#67e8f9",
  "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#d9f99d",
  "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fecdd3", "#e2e8f0",
];
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STORAGE_KEY = "queens-archive-stats:v2";
const UNIT_TYPES = ["row", "col", "region"];

const boardEl = document.querySelector("#board");
const selectEl = document.querySelector("#puzzleSelect");
const randomSizeEl = document.querySelector("#randomSize");
const randomButton = document.querySelector("#randomButton");
const statusEl = document.querySelector("#status");
const metaEl = document.querySelector("#meta");
const statsEl = document.querySelector("#stats");
const timerEl = document.querySelector("#timer");
const ratingPanel = document.querySelector("#ratingPanel");
const clearButton = document.querySelector("#clearButton");
const checkButton = document.querySelector("#checkButton");
const hintButton = document.querySelector("#hintButton");
const solutionButton = document.querySelector("#solutionButton");
const exportStatsButton = document.querySelector("#exportStatsButton");

let activePuzzle = PUZZLES[0];
let marks = [];
let showSolution = false;
let checkMode = false;
let hintAction = null;
let hintCount = 0;
let hintMessage = "";
let solvedLogged = false;
let timerStartedAt = null;
let elapsedBeforeStart = 0;
let timerHandle = null;
let stats = loadStats();
let randomCounter = 0;

function cellIndex(row, col, size = activePuzzle.size) {
  return row * size + col;
}

function solutionSet(puzzle) {
  return new Set([...puzzle.solution].map((v, i) => v === "Q" ? i : -1).filter(i => i >= 0));
}

function solutionIndices(puzzle) {
  return [...puzzle.solution].map((v, i) => v === "Q" ? i : -1).filter(i => i >= 0);
}

function queenIndices(state = marks) {
  return state.map((value, i) => value === "q" ? i : -1).filter(i => i >= 0);
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

function loadPuzzle(puzzle, selectValue = puzzle.id) {
  activePuzzle = puzzle;
  marks = Array(activePuzzle.size * activePuzzle.size).fill("");
  showSolution = false;
  checkMode = false;
  hintAction = null;
  hintCount = 0;
  hintMessage = "";
  solvedLogged = false;
  solutionButton.textContent = "Show solution";
  checkButton.textContent = "Check";
  resetTimer();
  if ([...selectEl.options].some(option => option.value === selectValue)) selectEl.value = selectValue;
  render();
}

function render() {
  const n = activePuzzle.size;
  boardEl.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.innerHTML = "";

  const errors = findErrors(checkMode);
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
      applyRegionBorders(cell, row, col, idx, regionId, n);

      if (errors.has(idx)) cell.classList.add("error");
      if (hintAction?.idx === idx) {
        cell.classList.add("hint");
        cell.dataset.hintAction = hintAction.action;
      }
      if (showSolution && answer.has(idx) && marks[idx] !== "q") cell.classList.add("solution");

      cell.addEventListener("click", () => {
        startTimer();
        marks[idx] = nextState(marks[idx]);
        checkMode = false;
        hintAction = null;
        hintMessage = "";
        render();
      });

      boardEl.append(cell);
    }
  }

  renderStatus();
  renderStats();
  renderRatingPanel();
  metaEl.textContent = metaText(activePuzzle);
}

function applyRegionBorders(cell, row, col, idx, regionId, n) {
  const thick = "4px";
  const thin = "1px";
  cell.style.borderTopWidth = row === 0 || getRegion(activePuzzle, idx - n) !== regionId ? thick : thin;
  cell.style.borderBottomWidth = row === n - 1 || getRegion(activePuzzle, idx + n) !== regionId ? thick : thin;
  cell.style.borderLeftWidth = col === 0 || getRegion(activePuzzle, idx - 1) !== regionId ? thick : thin;
  cell.style.borderRightWidth = col === n - 1 || getRegion(activePuzzle, idx + 1) !== regionId ? thick : thin;
}

function metaText(puzzle) {
  const unique = puzzle.unique === false ? "not uniqueness-verified" : "unique";
  const source = puzzle.source ?? "unknown source";
  const attempts = puzzle.generatedAttempts ? ` · generated in ${puzzle.generatedAttempts} attempts` : "";
  const human = puzzle.humanSteps ? ` · human steps ${puzzle.humanSteps}` : "";
  const link = puzzle.url ?? puzzle.id;
  return `${source} · ${unique}${attempts}${human} · ${link}`;
}

function regionCodeToNumber(code) {
  const found = ALPHABET.indexOf(code);
  return found >= 0 ? found : code.codePointAt(0);
}

function nextState(state) {
  if (state === "") return "x";
  if (state === "x") return "q";
  return "";
}

function findErrors(includeSolutionErrors = false) {
  const n = activePuzzle.size;
  const errors = new Set();
  const queens = queenIndices();
  const answer = solutionSet(activePuzzle);

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
    if (includeSolutionErrors && !answer.has(idx)) errors.add(idx);
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

  if (includeSolutionErrors) {
    for (const idx of answer) if (marks[idx] === "x") errors.add(idx);
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

function isSolvedExact() {
  const answer = solutionSet(activePuzzle);
  for (let idx = 0; idx < marks.length; idx++) {
    if (answer.has(idx) && marks[idx] !== "q") return false;
    if (!answer.has(idx) && marks[idx] === "q") return false;
  }
  return true;
}

function renderStatus() {
  const n = activePuzzle.size;
  const logicalErrors = findErrors(false);
  const checkErrors = checkMode ? findErrors(true) : new Set();
  const queens = queenIndices();

  statusEl.className = "status";
  if (hintAction && hintMessage) {
    statusEl.textContent = hintMessage;
    return;
  }

  if (logicalErrors.size) {
    statusEl.classList.add("bad");
    statusEl.textContent = "Conflict: row, column, region, or adjacent queens.";
    return;
  }

  if (checkMode && checkErrors.size) {
    statusEl.classList.add("bad");
    statusEl.textContent = "Some marks contradict the solution.";
    return;
  }

  if (isSolvedExact()) {
    statusEl.classList.add("ok");
    statusEl.textContent = `Solved in ${formatTime(currentElapsedMs())} with ${hintCount} hint${hintCount === 1 ? "" : "s"}.`;
    finishSolveIfNeeded();
    return;
  }

  statusEl.textContent = `${queens.length}/${n} queens placed · ${hintCount} hint${hintCount === 1 ? "" : "s"}`;
}

function finishSolveIfNeeded() {
  if (solvedLogged) return;
  solvedLogged = true;
  stopTimer();
  const elapsedMs = currentElapsedMs();
  const entry = ensurePuzzleStats(activePuzzle.id);
  entry.played += 1;
  entry.solved += 1;
  entry.lastMs = elapsedMs;
  entry.lastHints = hintCount;
  entry.bestMs = entry.bestMs == null ? elapsedMs : Math.min(entry.bestMs, elapsedMs);
  stats.sessions.push({
    id: activePuzzle.id,
    day: activePuzzle.day ?? null,
    source: activePuzzle.source ?? null,
    size: activePuzzle.size,
    solvedAt: new Date().toISOString(),
    elapsedMs,
    hints: hintCount,
    generatedAttempts: activePuzzle.generatedAttempts ?? null,
    humanSteps: activePuzzle.humanSteps ?? null,
  });
  saveStats();
}

function renderStats() {
  const entry = ensurePuzzleStats(activePuzzle.id, false);
  const totalSolved = stats.sessions.length;
  const best = entry?.bestMs == null ? "—" : formatTime(entry.bestMs);
  statsEl.textContent = `Best for this board: ${best} · total solved here: ${entry?.solved ?? 0} · all local solves: ${totalSolved}`;
}

function renderRatingPanel() {
  const solvedOrRated = solvedLogged || ensurePuzzleStats(activePuzzle.id, false);
  ratingPanel.hidden = !solvedOrRated;
  if (ratingPanel.hidden) return;
  const entry = ensurePuzzleStats(activePuzzle.id);
  ratingPanel.innerHTML = "";
  ratingPanel.append(
    ratingRow("Play rating", "playRating", entry.playRating),
    ratingRow("Visual rating", "visualRating", entry.visualRating),
  );
}

function ratingRow(label, key, currentValue) {
  const row = document.createElement("div");
  row.className = "rating-row";
  const title = document.createElement("span");
  title.textContent = label;
  const stars = document.createElement("div");
  stars.className = "stars";
  for (let value = 1; value <= 5; value++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star${value <= Number(currentValue ?? 0) ? " active" : ""}`;
    button.textContent = "★";
    button.setAttribute("aria-label", `${label}: ${value} of 5`);
    button.addEventListener("click", () => {
      const entry = ensurePuzzleStats(activePuzzle.id);
      entry[key] = value;
      saveStats();
      renderRatingPanel();
    });
    stars.append(button);
  }
  row.append(title, stars);
  return row;
}

function startTimer() {
  if (solvedLogged || timerStartedAt != null) return;
  timerStartedAt = performance.now();
  timerHandle = setInterval(renderTimer, 250);
  renderTimer();
}

function stopTimer() {
  if (timerStartedAt == null) return;
  elapsedBeforeStart += performance.now() - timerStartedAt;
  timerStartedAt = null;
  clearInterval(timerHandle);
  timerHandle = null;
  renderTimer();
}

function resetTimer() {
  timerStartedAt = null;
  elapsedBeforeStart = 0;
  clearInterval(timerHandle);
  timerHandle = null;
  renderTimer();
}

function currentElapsedMs() {
  return elapsedBeforeStart + (timerStartedAt == null ? 0 : performance.now() - timerStartedAt);
}

function renderTimer() {
  timerEl.textContent = formatTime(currentElapsedMs());
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}:${String(restMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function giveHint() {
  startTimer();
  checkMode = false;
  const hint = findLogicalHint(activePuzzle, marks, { allowSolutionFallback: false });
  if (!hint) {
    hintAction = null;
    hintMessage = "No simple logical hint found from the current marks. Try placing/removing a mark, or use Show solution.";
    statusEl.textContent = hintMessage;
    return;
  }
  hintAction = hint;
  hintCount += 1;
  hintMessage = hint.message;
  render();
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      puzzleStats: parsed.puzzleStats && typeof parsed.puzzleStats === "object" ? parsed.puzzleStats : {},
    };
  } catch {
    return { sessions: [], puzzleStats: {} };
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function ensurePuzzleStats(id, create = true) {
  if (!stats.puzzleStats[id] && create) {
    stats.puzzleStats[id] = {
      played: 0,
      solved: 0,
      bestMs: null,
      lastMs: null,
      lastHints: 0,
      playRating: null,
      visualRating: null,
    };
  }
  return stats.puzzleStats[id];
}

function findLogicalHint(puzzle, state, options = {}) {
  const conflict = findMarkedConflict(puzzle, state);
  if (conflict) return conflict;

  const exclusion = firstQueenExclusion(puzzle, state);
  if (exclusion) return exclusion;

  const candidates = computeCandidates(puzzle, state);
  const single = findSingleCandidateHint(puzzle, state, candidates);
  if (single) return single;

  const intersection = findSetExclusionHint(puzzle, state, candidates, 1);
  if (intersection) return intersection;

  const pair = findSetExclusionHint(puzzle, state, candidates, 2);
  if (pair) return pair;

  const triple = findSetExclusionHint(puzzle, state, candidates, 3);
  if (triple) return triple;

  if (options.allowSolutionFallback) {
    const answer = solutionSet(puzzle);
    const wrongQueen = queenIndices(state).find(idx => !answer.has(idx));
    if (wrongQueen != null) return { idx: wrongQueen, action: "clear", message: "Remove this queen: it is not in the stored solution." };
    const blockedAnswer = [...answer].find(idx => state[idx] === "x");
    if (blockedAnswer != null) return { idx: blockedAnswer, action: "clear", message: "Remove this X: this cell is in the stored solution." };
    const next = solutionIndices(puzzle).find(idx => state[idx] !== "q");
    if (next != null) return { idx: next, action: "q", message: "Put a queen here: solution fallback." };
  }
  return null;
}

function findMarkedConflict(puzzle, state) {
  const n = puzzle.size;
  const queens = queenIndices(state);
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i], b = queens[j];
      if (rowOf(a, n) === rowOf(b, n)) return { idx: b, action: "clear", message: `Remove this queen: row ${rowOf(a, n) + 1} already has another queen.` };
      if (colOf(a, n) === colOf(b, n)) return { idx: b, action: "clear", message: `Remove this queen: column ${colOf(a, n) + 1} already has another queen.` };
      if (puzzle.regions[a] === puzzle.regions[b]) return { idx: b, action: "clear", message: `Remove this queen: this color region already has another queen.` };
      if (Math.max(Math.abs(rowOf(a, n) - rowOf(b, n)), Math.abs(colOf(a, n) - colOf(b, n))) <= 1) {
        return { idx: b, action: "clear", message: "Remove this queen: queens may not touch, even diagonally." };
      }
    }
  }
  return null;
}

function firstQueenExclusion(puzzle, state) {
  const n = puzzle.size;
  for (const queen of queenIndices(state)) {
    const reasons = excludedByQueen(puzzle, queen);
    for (const item of reasons) {
      if (state[item.idx] === "") {
        return { idx: item.idx, action: "x", message: `Put X here: ${item.reason}.` };
      }
    }
  }
  return null;
}

function excludedByQueen(puzzle, queenIdx) {
  const n = puzzle.size;
  const result = [];
  for (let idx = 0; idx < n * n; idx++) {
    if (idx === queenIdx) continue;
    if (rowOf(idx, n) === rowOf(queenIdx, n)) result.push({ idx, reason: `row ${rowOf(queenIdx, n) + 1} already has a queen` });
    else if (colOf(idx, n) === colOf(queenIdx, n)) result.push({ idx, reason: `column ${colOf(queenIdx, n) + 1} already has a queen` });
    else if (puzzle.regions[idx] === puzzle.regions[queenIdx]) result.push({ idx, reason: "this color region already has a queen" });
    else if (Math.max(Math.abs(rowOf(idx, n) - rowOf(queenIdx, n)), Math.abs(colOf(idx, n) - colOf(queenIdx, n))) <= 1) {
      result.push({ idx, reason: "queens may not touch" });
    }
  }
  return result;
}

function computeCandidates(puzzle, state) {
  const n = puzzle.size;
  const candidates = new Set();
  const queens = queenIndices(state);
  for (let idx = 0; idx < n * n; idx++) {
    if (state[idx] === "x") continue;
    if (state[idx] === "q") {
      candidates.add(idx);
      continue;
    }
    let ok = true;
    for (const queen of queens) {
      if (rowOf(idx, n) === rowOf(queen, n) || colOf(idx, n) === colOf(queen, n) || puzzle.regions[idx] === puzzle.regions[queen]) {
        ok = false;
        break;
      }
      if (Math.max(Math.abs(rowOf(idx, n) - rowOf(queen, n)), Math.abs(colOf(idx, n) - colOf(queen, n))) <= 1) {
        ok = false;
        break;
      }
    }
    if (ok) candidates.add(idx);
  }
  return candidates;
}

function findSingleCandidateHint(puzzle, state, candidates) {
  for (const unit of getAllUnits(puzzle)) {
    if (unit.indices.some(idx => state[idx] === "q")) continue;
    const possible = unit.indices.filter(idx => candidates.has(idx));
    if (possible.length === 1 && state[possible[0]] !== "q") {
      return { idx: possible[0], action: "q", message: `Put a queen here: ${unit.label} has only one legal cell left.` };
    }
  }
  return null;
}

function findSetExclusionHint(puzzle, state, candidates, setSize) {
  for (const sourceType of UNIT_TYPES) {
    const units = getUnitsByType(puzzle, sourceType)
      .filter(unit => !unit.indices.some(idx => state[idx] === "q"))
      .map(unit => ({ ...unit, candidates: unit.indices.filter(idx => candidates.has(idx)) }))
      .filter(unit => unit.candidates.length > 0);

    for (const group of combinations(units, setSize)) {
      const candidateUnion = unique(group.flatMap(unit => unit.candidates));
      for (const targetType of UNIT_TYPES) {
        if (targetType === sourceType) continue;
        const targetKeys = unique(candidateUnion.map(idx => unitKey(puzzle, idx, targetType)));
        if (targetKeys.length !== setSize) continue;
        const targetCells = unique(targetKeys.flatMap(key => unitIndices(puzzle, targetType, key)));
        const candidateSet = new Set(candidateUnion);
        const elimination = targetCells.find(idx => !candidateSet.has(idx) && state[idx] === "" && candidates.has(idx));
        if (elimination != null) {
          const sourceLabel = group.map(unit => unit.label).join(setSize === 1 ? "" : " + ");
          const targetLabel = targetKeys.map(key => unitLabel(targetType, key)).join(setSize === 1 ? "" : " + ");
          const plural = setSize === 1 ? "is" : "are";
          return {
            idx: elimination,
            action: "x",
            message: `Put X here: all candidates for ${sourceLabel} ${plural} inside ${targetLabel}, so the rest of ${targetLabel} is excluded.`,
          };
        }
      }
    }
  }
  return null;
}

function getAllUnits(puzzle) {
  return UNIT_TYPES.flatMap(type => getUnitsByType(puzzle, type));
}

function getUnitsByType(puzzle, type) {
  const n = puzzle.size;
  if (type === "row") return [...Array(n).keys()].map(key => ({ type, key, label: unitLabel(type, key), indices: unitIndices(puzzle, type, key) }));
  if (type === "col") return [...Array(n).keys()].map(key => ({ type, key, label: unitLabel(type, key), indices: unitIndices(puzzle, type, key) }));
  return unique([...puzzle.regions]).map(key => ({ type, key, label: unitLabel(type, key), indices: unitIndices(puzzle, type, key) }));
}

function unitIndices(puzzle, type, key) {
  const n = puzzle.size;
  if (type === "row") return [...Array(n).keys()].map(col => key * n + col);
  if (type === "col") return [...Array(n).keys()].map(row => row * n + key);
  return [...puzzle.regions].map((region, idx) => region === key ? idx : -1).filter(idx => idx >= 0);
}

function unitKey(puzzle, idx, type) {
  const n = puzzle.size;
  if (type === "row") return rowOf(idx, n);
  if (type === "col") return colOf(idx, n);
  return puzzle.regions[idx];
}

function unitLabel(type, key) {
  if (type === "row") return `row ${Number(key) + 1}`;
  if (type === "col") return `column ${Number(key) + 1}`;
  return `region ${key}`;
}

function solveByHumanLogic(puzzle) {
  const state = Array(puzzle.size * puzzle.size).fill("");
  const steps = [];
  const maxSteps = puzzle.size * puzzle.size * 3;
  for (let i = 0; i < maxSteps; i++) {
    if (isStateSolved(puzzle, state)) return { solved: true, steps };
    const hint = findLogicalHint(puzzle, state, { allowSolutionFallback: false });
    if (!hint || hint.action === "clear") return { solved: false, steps };
    if (state[hint.idx] === hint.action) return { solved: false, steps };
    state[hint.idx] = hint.action;
    steps.push(hint);
  }
  return { solved: isStateSolved(puzzle, state), steps };
}

function isStateSolved(puzzle, state) {
  const answer = solutionSet(puzzle);
  for (let idx = 0; idx < state.length; idx++) {
    if (answer.has(idx) && state[idx] !== "q") return false;
    if (!answer.has(idx) && state[idx] === "q") return false;
  }
  return true;
}

async function createRandomPuzzle(size) {
  const maxAttempts = size >= 9 ? 9000 : 5200;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seedSolution = randomQueenSolution(size);
    if (!seedSolution) continue;

    const regionNumbers = growRegionsFromQueens(size, seedSolution);
    if (!looksReasonableRegionLayout(regionNumbers, size)) continue;

    const regions = encodeRegions(regionNumbers, size);
    const result = solveRegions({ size, regions }, 2);
    if (result.count !== 1) {
      if (attempt % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      continue;
    }

    const solution = indicesToSolution(result.first, size);
    const puzzle = {
      id: `random-${size}-${Date.now()}-${++randomCounter}`,
      source: "random-generator-v2",
      day: null,
      size,
      generatedAt: new Date().toISOString(),
      generatedAttempts: attempt,
      regions,
      solution,
      solutionCols: solutionToCols(solution, size),
      url: null,
      unique: true,
      solutionCountChecked: 1,
    };
    const human = solveByHumanLogic(puzzle);
    if (human.solved && human.steps.length >= size) {
      puzzle.humanSteps = human.steps.length;
      puzzle.firstHint = human.steps[0]?.message ?? null;
      return puzzle;
    }

    if (attempt % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`No human-solvable unique ${size}×${size} board found quickly. Try again.`);
}

function randomQueenSolution(size) {
  const rows = [];
  function backtrack(row, usedCols) {
    if (row === size) return true;
    const cols = shuffle([...Array(size).keys()]);
    for (const col of cols) {
      if (usedCols.has(col)) continue;
      if (row > 0 && Math.abs(rows[row - 1] - col) <= 1) continue;
      rows[row] = col;
      usedCols.add(col);
      if (backtrack(row + 1, usedCols)) return true;
      usedCols.delete(col);
      rows.pop();
    }
    return false;
  }
  return backtrack(0, new Set()) ? rows.map((col, row) => row * size + col) : null;
}

function growRegionsFromQueens(size, queenCells) {
  const total = size * size;
  const regions = Array(total).fill(-1);
  const counts = Array(size).fill(0);
  const targets = balancedRegionTargets(size);

  queenCells.forEach((idx, region) => {
    regions[idx] = region;
    counts[region] = 1;
  });

  let remaining = total - size;
  while (remaining > 0) {
    const candidates = growthCandidates(regions, counts, targets, size, queenCells);
    if (!candidates.length) return randomConnectedRegions(size);
    const selected = weightedChoice(candidates);
    regions[selected.idx] = selected.region;
    counts[selected.region] += 1;
    remaining -= 1;
  }
  return regions;
}

function balancedRegionTargets(size) {
  const total = size * size;
  const base = Math.floor(total / size);
  const targets = Array(size).fill(base);
  let remainder = total - base * size;
  for (const region of shuffle([...Array(size).keys()])) {
    if (remainder <= 0) break;
    targets[region] += 1;
    remainder -= 1;
  }
  for (let i = 0; i < targets.length; i++) {
    targets[i] += Math.floor(Math.random() * 3) - 1;
    targets[i] = Math.max(3, Math.min(size + 4, targets[i]));
  }
  return normalizeTargets(targets, total);
}

function normalizeTargets(targets, total) {
  while (targets.reduce((a, b) => a + b, 0) < total) targets[Math.floor(Math.random() * targets.length)] += 1;
  while (targets.reduce((a, b) => a + b, 0) > total) {
    const i = Math.floor(Math.random() * targets.length);
    if (targets[i] > 3) targets[i] -= 1;
  }
  return targets;
}

function growthCandidates(regions, counts, targets, size, queenCells) {
  const total = size * size;
  const candidates = [];
  for (let idx = 0; idx < total; idx++) {
    if (regions[idx] !== -1) continue;
    const neighborRegions = unique(assignedNeighborRegions(regions, size, idx));
    for (const region of neighborRegions) {
      const seed = queenCells[region];
      const distance = manhattan(idx, seed, size);
      const targetPressure = Math.max(1, targets[region] - counts[region] + 1);
      const overTargetPenalty = counts[region] >= targets[region] ? 0.15 : 1;
      const compactness = 1 / Math.max(1, distance);
      const jitter = 0.65 + Math.random() * 0.7;
      candidates.push({
        idx,
        region,
        weight: targetPressure * overTargetPenalty * compactness * jitter,
      });
    }
  }
  return candidates;
}

function randomConnectedRegions(size) {
  const total = size * size;
  const regions = Array(total).fill(-1);
  const seeds = shuffle([...Array(total).keys()]).slice(0, size);
  for (let region = 0; region < seeds.length; region++) regions[seeds[region]] = region;

  let remaining = total - size;
  while (remaining > 0) {
    const candidates = [];
    for (let idx = 0; idx < total; idx++) {
      if (regions[idx] !== -1) continue;
      const neighborRegions = assignedNeighborRegions(regions, size, idx);
      if (neighborRegions.length) candidates.push([idx, neighborRegions]);
    }
    const [idx, neighborRegions] = candidates[Math.floor(Math.random() * candidates.length)];
    regions[idx] = neighborRegions[Math.floor(Math.random() * neighborRegions.length)];
    remaining -= 1;
  }
  return regions;
}

function looksReasonableRegionLayout(regions, size) {
  const counts = Array(size).fill(0);
  for (const region of regions) counts[region] += 1;
  if (counts.some(count => count < 3 || count > size + 5)) return false;
  if (regionBoundaryCount(regions, size) < size * 7) return false;
  const rowRuns = maxRun(regions, size, "row");
  const colRuns = maxRun(regions, size, "col");
  return rowRuns < size && colRuns < size;
}

function regionBoundaryCount(regions, size) {
  let boundaries = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      if (col + 1 < size && regions[idx] !== regions[idx + 1]) boundaries += 1;
      if (row + 1 < size && regions[idx] !== regions[idx + size]) boundaries += 1;
    }
  }
  return boundaries;
}

function maxRun(regions, size, direction) {
  let best = 1;
  for (let outer = 0; outer < size; outer++) {
    let run = 1;
    for (let inner = 1; inner < size; inner++) {
      const prev = direction === "row" ? outer * size + inner - 1 : (inner - 1) * size + outer;
      const idx = direction === "row" ? outer * size + inner : inner * size + outer;
      if (regions[idx] === regions[prev]) run += 1;
      else run = 1;
      best = Math.max(best, run);
    }
  }
  return best;
}

function assignedNeighborRegions(regions, size, idx) {
  const row = Math.floor(idx / size);
  const col = idx % size;
  const found = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    const value = regions[nr * size + nc];
    if (value !== -1) found.push(value);
  }
  return found;
}

function solveRegions(puzzle, limit = 2) {
  const n = puzzle.size;
  const regionValues = [...new Set([...puzzle.regions])];
  const regionIndex = new Map(regionValues.map((region, i) => [region, i]));
  let count = 0;
  let first = null;
  const placements = [];

  function backtrack(row, usedCols, usedRegions) {
    if (count >= limit) return;
    if (row === n) {
      if (usedRegions.size === n) {
        count += 1;
        if (!first) first = [...placements];
      }
      return;
    }

    for (let col = 0; col < n; col++) {
      const idx = row * n + col;
      const region = regionIndex.get(puzzle.regions[idx]);
      if (usedCols.has(col) || usedRegions.has(region)) continue;
      const previous = placements[placements.length - 1];
      if (previous != null && Math.abs(previous % n - col) <= 1) continue;
      placements.push(idx);
      usedCols.add(col);
      usedRegions.add(region);
      backtrack(row + 1, usedCols, usedRegions);
      usedCols.delete(col);
      usedRegions.delete(region);
      placements.pop();
    }
  }

  backtrack(0, new Set(), new Set());
  return { count, first };
}

function encodeRegions(regions, size) {
  return regions.map(value => ALPHABET[value] ?? String.fromCharCode(65 + value)).join("").slice(0, size * size);
}

function indicesToSolution(indices, size) {
  const solution = Array(size * size).fill(".");
  for (const idx of indices ?? []) solution[idx] = "Q";
  return solution.join("");
}

function solutionToCols(solution, size) {
  const cols = [];
  for (let row = 0; row < size; row++) cols.push(solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
  return cols;
}

function rowOf(idx, size) {
  return Math.floor(idx / size);
}

function colOf(idx, size) {
  return idx % size;
}

function manhattan(a, b, size) {
  return Math.abs(rowOf(a, size) - rowOf(b, size)) + Math.abs(colOf(a, size) - colOf(b, size));
}

function unique(values) {
  return [...new Set(values)];
}

function weightedChoice(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  for (const item of items) {
    pick -= item.weight;
    if (pick <= 0) return item;
  }
  return items[items.length - 1];
}

function combinations(items, size) {
  if (size === 1) return items.map(item => [item]);
  const result = [];
  function walk(start, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= items.length - (size - combo.length); i++) {
      combo.push(items[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  }
  walk(0, []);
  return result;
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

selectEl.addEventListener("change", () => {
  const puzzle = PUZZLES.find(p => p.id === selectEl.value) ?? PUZZLES[0];
  loadPuzzle(puzzle);
});

clearButton.addEventListener("click", () => {
  marks = Array(activePuzzle.size * activePuzzle.size).fill("");
  showSolution = false;
  checkMode = false;
  hintAction = null;
  hintCount = 0;
  hintMessage = "";
  solvedLogged = false;
  solutionButton.textContent = "Show solution";
  checkButton.textContent = "Check";
  resetTimer();
  render();
});

checkButton.addEventListener("click", () => {
  startTimer();
  checkMode = !checkMode;
  hintAction = null;
  hintMessage = "";
  checkButton.textContent = checkMode ? "Hide check" : "Check";
  render();
});

hintButton.addEventListener("click", giveHint);

solutionButton.addEventListener("click", () => {
  startTimer();
  showSolution = !showSolution;
  solutionButton.textContent = showSolution ? "Hide solution" : "Show solution";
  render();
});

exportStatsButton.addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    activePuzzle: activePuzzle.id,
    stats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `queens-stats-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

randomButton.addEventListener("click", async () => {
  const size = Number(randomSizeEl.value);
  randomButton.disabled = true;
  const oldText = randomButton.textContent;
  randomButton.textContent = "Generating…";
  statusEl.className = "status";
  statusEl.textContent = `Searching for a unique, human-solvable ${size}×${size} random board…`;
  try {
    const puzzle = await createRandomPuzzle(size);
    const optionValue = "__random__";
    let option = [...selectEl.options].find(item => item.value === optionValue);
    if (!option) {
      option = document.createElement("option");
      option.value = optionValue;
      selectEl.prepend(option);
    }
    option.textContent = `Random ${size}×${size} · ${puzzle.generatedAttempts} attempts · ${puzzle.humanSteps} steps`;
    loadPuzzle(puzzle, optionValue);
  } catch (error) {
    statusEl.className = "status bad";
    statusEl.textContent = error.message;
  } finally {
    randomButton.disabled = false;
    randomButton.textContent = oldText;
  }
});

populateSelect();
loadPuzzle(PUZZLES[0]?.id ? PUZZLES[0] : createEmptyFallback());

function createEmptyFallback() {
  return {
    id: "empty-fallback",
    source: "fallback",
    day: null,
    size: 7,
    regions: "0".repeat(49),
    solution: ".".repeat(49),
    solutionCols: [],
    unique: false,
  };
}
