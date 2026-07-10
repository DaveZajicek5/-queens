import { PUZZLES } from "./puzzles.js";

const COLORS = [
  "#fca5a5", "#fdba74", "#fde68a", "#86efac", "#67e8f9",
  "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#d9f99d",
  "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fecdd3", "#e2e8f0",
];
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STORAGE_KEY = "queens-archive-stats:v2";

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
let hintIndex = null;
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

function loadPuzzle(puzzle, selectValue = puzzle.id) {
  activePuzzle = puzzle;
  marks = Array(activePuzzle.size * activePuzzle.size).fill("");
  showSolution = false;
  checkMode = false;
  hintIndex = null;
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
      if (hintIndex === idx) cell.classList.add("hint");
      if (showSolution && answer.has(idx) && marks[idx] !== "q") cell.classList.add("solution");

      cell.addEventListener("click", () => {
        startTimer();
        marks[idx] = nextState(marks[idx]);
        checkMode = false;
        hintIndex = null;
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
  const link = puzzle.url ?? puzzle.id;
  return `${source} · ${unique}${attempts} · ${link}`;
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
  if (hintIndex != null && hintMessage) {
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
  const answer = solutionSet(activePuzzle);
  const wrongQueen = queenIndices().find(idx => !answer.has(idx));
  if (wrongQueen != null) {
    hintIndex = wrongQueen;
    hintCount += 1;
    hintMessage = "Hint: this square cannot be a queen.";
    render();
    return;
  }

  const blockedAnswer = [...answer].find(idx => marks[idx] === "x");
  if (blockedAnswer != null) {
    hintIndex = blockedAnswer;
    hintCount += 1;
    hintMessage = "Hint: do not cross out this square.";
    render();
    return;
  }

  const next = solutionIndices(activePuzzle).find(idx => marks[idx] !== "q");
  if (next == null) {
    statusEl.textContent = "No hint needed.";
    return;
  }
  hintIndex = next;
  hintCount += 1;
  hintMessage = "Hint: this square belongs in the solution.";
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

async function createRandomPuzzle(size) {
  const maxAttempts = size >= 9 ? 4500 : 2500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const regions = randomConnectedRegions(size);
    const result = solveRegions({ size, regions: encodeRegions(regions, size) }, 2);
    if (result.count === 1) {
      const solution = indicesToSolution(result.first, size);
      return {
        id: `random-${size}-${Date.now()}-${++randomCounter}`,
        source: "random-generator",
        day: null,
        size,
        generatedAt: new Date().toISOString(),
        generatedAttempts: attempt,
        regions: encodeRegions(regions, size),
        solution,
        solutionCols: solutionToCols(solution, size),
        url: null,
        unique: true,
        solutionCountChecked: 1,
      };
    }
    if (attempt % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`No unique ${size}×${size} board found quickly. Try again.`);
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
  hintIndex = null;
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
  hintIndex = null;
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
  statusEl.textContent = `Searching for a unique ${size}×${size} random board…`;
  try {
    const puzzle = await createRandomPuzzle(size);
    const optionValue = "__random__";
    let option = [...selectEl.options].find(item => item.value === optionValue);
    if (!option) {
      option = document.createElement("option");
      option.value = optionValue;
      selectEl.prepend(option);
    }
    option.textContent = `Random ${size}×${size} · ${puzzle.generatedAttempts} attempts`;
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
