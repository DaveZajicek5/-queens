import { PUZZLES } from "./puzzles.js";

const COLORS = [
  "#fca5a5", "#fdba74", "#fde68a", "#86efac", "#67e8f9",
  "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#d9f99d",
  "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fecdd3", "#e2e8f0",
];
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STORAGE_KEY = "queens-archive-stats:v2";
const UNIT_TYPES = ["row", "col", "region"];
const TRANSFORMS = [
  ["identity", (r, c, n) => [r, c]],
  ["rotate 90", (r, c, n) => [c, n - 1 - r]],
  ["rotate 180", (r, c, n) => [n - 1 - r, n - 1 - c]],
  ["rotate 270", (r, c, n) => [n - 1 - c, r]],
  ["mirror horizontal", (r, c, n) => [r, n - 1 - c]],
  ["mirror vertical", (r, c, n) => [n - 1 - r, c]],
  ["transpose", (r, c, n) => [c, r]],
  ["anti transpose", (r, c, n) => [n - 1 - c, n - 1 - r]],
];

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

function rowOf(idx, size) {
  return Math.floor(idx / size);
}

function colOf(idx, size) {
  return idx % size;
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
  const template = puzzle.templateDay ? ` · template day ${puzzle.templateDay}` : "";
  const transform = puzzle.transformName ? ` · ${puzzle.transformName}` : "";
  const link = puzzle.url ?? puzzle.id;
  return `${source} · ${unique}${template}${transform} · ${link}`;
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
    const row = rowOf(idx, n);
    const col = colOf(idx, n);
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
      if (Math.max(Math.abs(rowOf(a, n) - rowOf(b, n)), Math.abs(colOf(a, n) - colOf(b, n))) <= 1) {
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
    templateDay: activePuzzle.templateDay ?? null,
    size: activePuzzle.size,
    solvedAt: new Date().toISOString(),
    elapsedMs,
    hints: hintCount,
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
  const hint = findLogicalHint(activePuzzle, marks) ?? findForcedCompletionHint(activePuzzle, marks);
  if (!hint) {
    hintAction = null;
    hintMessage = "No hint found from the current marks. Try clearing a contradiction or use Show solution.";
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

function findLogicalHint(puzzle, state) {
  return findMarkedConflict(puzzle, state)
    ?? firstQueenExclusion(puzzle, state)
    ?? findSingleCandidateHint(puzzle, state, computeCandidates(puzzle, state))
    ?? findSetExclusionHint(puzzle, state, computeCandidates(puzzle, state), 1)
    ?? findSetExclusionHint(puzzle, state, computeCandidates(puzzle, state), 2)
    ?? findSetExclusionHint(puzzle, state, computeCandidates(puzzle, state), 3);
}

function findMarkedConflict(puzzle, state) {
  const n = puzzle.size;
  const queens = queenIndices(state);
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i], b = queens[j];
      if (rowOf(a, n) === rowOf(b, n)) return { idx: b, action: "clear", message: `Remove this queen: row ${rowOf(a, n) + 1} already has another queen.` };
      if (colOf(a, n) === colOf(b, n)) return { idx: b, action: "clear", message: `Remove this queen: column ${colOf(a, n) + 1} already has another queen.` };
      if (puzzle.regions[a] === puzzle.regions[b]) return { idx: b, action: "clear", message: "Remove this queen: this color region already has another queen." };
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
    for (let idx = 0; idx < n * n; idx++) {
      if (idx === queen || state[idx] !== "") continue;
      if (rowOf(idx, n) === rowOf(queen, n)) return { idx, action: "x", message: `Put X here: row ${rowOf(queen, n) + 1} already has a queen.` };
      if (colOf(idx, n) === colOf(queen, n)) return { idx, action: "x", message: `Put X here: column ${colOf(queen, n) + 1} already has a queen.` };
      if (puzzle.regions[idx] === puzzle.regions[queen]) return { idx, action: "x", message: "Put X here: this color region already has a queen." };
      if (Math.max(Math.abs(rowOf(idx, n) - rowOf(queen, n)), Math.abs(colOf(idx, n) - colOf(queen, n))) <= 1) return { idx, action: "x", message: "Put X here: queens may not touch." };
    }
  }
  return null;
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
      if (rowOf(idx, n) === rowOf(queen, n) || colOf(idx, n) === colOf(queen, n) || puzzle.regions[idx] === puzzle.regions[queen]) ok = false;
      if (Math.max(Math.abs(rowOf(idx, n) - rowOf(queen, n)), Math.abs(colOf(idx, n) - colOf(queen, n))) <= 1) ok = false;
      if (!ok) break;
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
          return { idx: elimination, action: "x", message: `Put X here: all candidates for ${sourceLabel} ${plural} inside ${targetLabel}, so the rest of ${targetLabel} is excluded.` };
        }
      }
    }
  }
  return null;
}

function findForcedCompletionHint(puzzle, state) {
  const result = solveRegions(puzzle, 2, state);
  if (result.count === 0) return { idx: firstNonEmptyIndex(state) ?? 0, action: "clear", message: "The current marks leave no valid completion; remove a conflicting mark." };
  if (result.count !== 1 || !result.first) return null;
  const forced = result.first.find(idx => state[idx] === "");
  if (forced != null) return { idx: forced, action: "q", message: "Put a queen here: every valid completion requires it." };
  const impossible = state.findIndex((value, idx) => value === "" && !result.first.includes(idx));
  if (impossible >= 0) return { idx: impossible, action: "x", message: "Put X here: no valid completion can use this cell." };
  return null;
}

function firstNonEmptyIndex(state) {
  const idx = state.findIndex(value => value !== "");
  return idx >= 0 ? idx : null;
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

async function createRandomPuzzle(size) {
  await new Promise(resolve => setTimeout(resolve, 0));
  const templates = PUZZLES.filter(puzzle => puzzle.size === size && puzzle.unique !== false && validArchiveTemplate(puzzle));
  if (!templates.length) throw new Error(`No archived ${size}×${size} templates are loaded.`);

  for (let attempt = 1; attempt <= 100; attempt++) {
    const base = templates[Math.floor(Math.random() * templates.length)];
    const transformed = transformPuzzle(base, attempt);
    const hint = findLogicalHint(transformed, Array(size * size).fill("")) ?? findForcedCompletionHint(transformed, Array(size * size).fill(""));
    if (hint) return transformed;
  }
  return transformPuzzle(templates[Math.floor(Math.random() * templates.length)], 101);
}

function validArchiveTemplate(puzzle) {
  try {
    validatePuzzleShape(puzzle);
    return solutionIndices(puzzle).length === puzzle.size && unique([...puzzle.regions]).length === puzzle.size;
  } catch {
    return false;
  }
}

function transformPuzzle(base, attempt) {
  const n = base.size;
  const [transformName, transform] = TRANSFORMS[Math.floor(Math.random() * TRANSFORMS.length)];
  const regions = Array(n * n).fill("0");
  const solution = Array(n * n).fill(".");

  for (let idx = 0; idx < n * n; idx++) {
    const r = rowOf(idx, n);
    const c = colOf(idx, n);
    const [tr, tc] = transform(r, c, n);
    const target = tr * n + tc;
    regions[target] = base.regions[idx];
    if (base.solution[idx] === "Q") solution[target] = "Q";
  }

  const relabelledRegions = relabelRegions(regions.join(""));
  const transformed = {
    id: `random-${n}-${Date.now()}-${++randomCounter}`,
    source: "random-template-shuffle",
    day: null,
    templateDay: base.day ?? null,
    templateId: base.id,
    transformName,
    generatedAt: new Date().toISOString(),
    generatedAttempts: attempt,
    size: n,
    regions: relabelledRegions,
    solution: solution.join(""),
    solutionCols: solutionToCols(solution.join(""), n),
    url: null,
    unique: true,
    solutionCountChecked: 1,
  };
  return transformed;
}

function relabelRegions(regionString) {
  const oldLabels = unique([...regionString]);
  const newLabels = shuffle(ALPHABET.slice(0, oldLabels.length).split(""));
  const map = new Map(oldLabels.map((label, i) => [label, newLabels[i]]));
  return [...regionString].map(label => map.get(label)).join("");
}

function solveRegions(puzzle, limit = 2, state = null) {
  const n = puzzle.size;
  const regionValues = unique([...puzzle.regions]);
  const regionIndex = new Map(regionValues.map((region, i) => [region, i]));
  const placements = [];
  const solutions = [];

  if (findStateConflict(puzzle, state ?? Array(n * n).fill(""))) return { count: 0, first: null, solutions: [] };

  function backtrack(row, usedCols, usedRegions) {
    if (solutions.length >= limit) return;
    if (row === n) {
      if (usedRegions.size === n) solutions.push([...placements]);
      return;
    }

    const rowQueens = state ? [...Array(n).keys()].filter(col => state[row * n + col] === "q") : [];
    const cols = rowQueens.length ? rowQueens : shuffle([...Array(n).keys()]);
    for (const col of cols) {
      const idx = row * n + col;
      if (state?.[idx] === "x") continue;
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
  return { count: solutions.length, first: solutions[0] ?? null, solutions };
}

function findStateConflict(puzzle, state) {
  const n = puzzle.size;
  const queens = queenIndices(state);
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i], b = queens[j];
      if (rowOf(a, n) === rowOf(b, n) || colOf(a, n) === colOf(b, n) || puzzle.regions[a] === puzzle.regions[b]) return true;
      if (Math.max(Math.abs(rowOf(a, n) - rowOf(b, n)), Math.abs(colOf(a, n) - colOf(b, n))) <= 1) return true;
    }
  }
  return false;
}

function solutionToCols(solution, size) {
  const cols = [];
  for (let row = 0; row < size; row++) cols.push(solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
  return cols;
}

function combinations(items, choose) {
  const out = [];
  function walk(start, picked) {
    if (picked.length === choose) {
      out.push([...picked]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      picked.push(items[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return out;
}

function unique(values) {
  return [...new Set(values)];
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
  const payload = { exportedAt: new Date().toISOString(), activePuzzle: activePuzzle.id, stats };
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
  statusEl.textContent = `Shuffling a real ${size}×${size} archive template…`;
  try {
    const puzzle = await createRandomPuzzle(size);
    const optionValue = "__random__";
    let option = [...selectEl.options].find(item => item.value === optionValue);
    if (!option) {
      option = document.createElement("option");
      option.value = optionValue;
      selectEl.prepend(option);
    }
    option.textContent = `Random ${size}×${size} · day ${puzzle.templateDay ?? "?"}`;
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
