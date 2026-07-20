import { PUZZLES } from "./puzzles.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BAG_KEY = "queens-archive-shuffle-bags:v2";
const RECENT_KEY = "queens-archive-recent:v2";
const modeEl = document.querySelector("#randomMode");
const sizeEl = document.querySelector("#randomSize");
const buttonEl = document.querySelector("#randomButton");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");
const guidedCache = new Map();

const transforms = [
  ["identity", (r, c) => [r, c]],
  ["rotate 90", (r, c, n) => [c, n - 1 - r]],
  ["rotate 180", (r, c, n) => [n - 1 - r, n - 1 - c]],
  ["rotate 270", (r, c, n) => [n - 1 - c, r]],
  ["mirror horizontal", (r, c, n) => [r, n - 1 - c]],
  ["mirror vertical", (r, c, n) => [n - 1 - r, c]],
  ["transpose", (r, c) => [c, r]],
  ["anti-transpose", (r, c, n) => [n - 1 - c, n - 1 - r]],
];

modeEl?.addEventListener("change", () => {
  if (modeEl.value === "generated") buttonEl.textContent = "Generate";
  else buttonEl.textContent = "New random";
});

buttonEl.addEventListener("click", event => {
  const mode = modeEl?.value;
  if (mode !== "guided" && mode !== "full") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const size = Number(sizeEl.value);
  buttonEl.disabled = true;
  const previous = buttonEl.textContent;
  buttonEl.textContent = mode === "guided" ? "Choosing guided…" : "Choosing…";

  requestAnimationFrame(() => {
    try {
      const base = nextTemplate(size, mode);
      const puzzle = transformPuzzle(base, mode);
      PUZZLES.push(puzzle);
      const option = document.createElement("option");
      option.value = puzzle.id;
      option.textContent = `${mode === "guided" ? "Guided" : "Full archive"} ${size}×${size} · day ${base.day}`;
      selectEl.prepend(option);
      selectEl.value = puzzle.id;
      selectEl.dispatchEvent(new Event("change"));
    } catch (error) {
      statusEl.className = "status bad";
      statusEl.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      buttonEl.disabled = false;
      buttonEl.textContent = previous;
    }
  });
}, true);

function archivePool(size, mode) {
  const cacheKey = `${mode}:${size}`;
  if (mode === "guided" && guidedCache.has(cacheKey)) return guidedCache.get(cacheKey);

  const seen = new Set();
  const pool = [];
  for (const puzzle of PUZZLES) {
    if (puzzle.size !== size || puzzle.day == null || puzzle.unique === false) continue;
    const key = canonicalShape(puzzle.regions, size);
    if (seen.has(key)) continue;
    if (mode === "guided" && !basicHumanPath(puzzle).solved) continue;
    seen.add(key);
    pool.push(puzzle);
  }
  if (mode === "guided") guidedCache.set(cacheKey, pool);
  return pool;
}

function nextTemplate(size, mode) {
  const pool = archivePool(size, mode);
  if (!pool.length) {
    throw new Error(mode === "guided"
      ? `No fully guided ${size}×${size} archive boards are loaded.`
      : `No ${size}×${size} archive boards are loaded.`);
  }

  const bucket = `${mode}:${size}`;
  const bags = readJson(BAG_KEY, {});
  const recent = readJson(RECENT_KEY, {});
  const validIds = new Set(pool.map(puzzle => puzzle.id));
  let bag = Array.isArray(bags[bucket]) ? bags[bucket].filter(id => validIds.has(id)) : [];
  const recentIds = Array.isArray(recent[bucket]) ? recent[bucket].filter(id => validIds.has(id)) : [];

  if (!bag.length) {
    const recentWindow = Math.min(mode === "guided" ? 12 : 30, Math.max(0, pool.length - 1));
    const blocked = new Set(recentIds.slice(-recentWindow));
    const preferred = shuffle(pool.map(puzzle => puzzle.id).filter(id => !blocked.has(id)));
    const delayed = shuffle(pool.map(puzzle => puzzle.id).filter(id => blocked.has(id)));
    bag = [...preferred, ...delayed];
  }

  const id = bag.shift();
  bags[bucket] = bag;
  recent[bucket] = [...recentIds, id].slice(-40);
  localStorage.setItem(BAG_KEY, JSON.stringify(bags));
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  return pool.find(puzzle => puzzle.id === id) ?? pool[0];
}

function transformPuzzle(base, mode) {
  const n = base.size;
  const [transformName, transform] = transforms[Math.floor(Math.random() * transforms.length)];
  const regions = Array(n * n);
  const solution = Array(n * n).fill(".");

  for (let index = 0; index < n * n; index++) {
    const row = Math.floor(index / n);
    const col = index % n;
    const [nextRow, nextCol] = transform(row, col, n);
    const target = nextRow * n + nextCol;
    regions[target] = base.regions[index];
    if (base.solution[index] === "Q") solution[target] = "Q";
  }

  const labels = [...new Set(regions)];
  const relabel = shuffle(ALPHABET.slice(0, labels.length).split(""));
  const map = new Map(labels.map((label, index) => [label, relabel[index]]));
  return {
    id: `${mode}-archive-${n}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    day: null,
    size: n,
    source: mode === "guided" ? "guided archive shuffle bag" : "full archive shuffle bag",
    templateDay: base.day,
    transformName,
    guided: mode === "guided",
    regions: regions.map(label => map.get(label)).join(""),
    solution: solution.join(""),
    solutionCols: solutionColumns(solution.join(""), n),
    unique: true,
  };
}

function basicHumanPath(puzzle) {
  const state = Array(puzzle.size * puzzle.size).fill("");
  const maxSteps = puzzle.size * puzzle.size * 4;
  let steps = 0;
  for (let guard = 0; guard < maxSteps; guard++) {
    if (stateSolved(puzzle, state)) return { solved: true, steps };
    const deduction = nextBasicDeduction(puzzle, state);
    if (!deduction || state[deduction.index] === deduction.value) return { solved: false, steps };
    state[deduction.index] = deduction.value;
    steps++;
  }
  return { solved: stateSolved(puzzle, state), steps };
}

function nextBasicDeduction(puzzle, state) {
  const queens = queenCells(state);
  for (const queen of queens) {
    for (let index = 0; index < state.length; index++) {
      if (state[index] === "" && attacks(puzzle, queen, index)) return { index, value: "x" };
    }
  }

  const candidates = candidateCells(puzzle, state);
  const units = allUnits(puzzle);
  for (const unit of units) {
    if (unit.some(index => state[index] === "q")) continue;
    const possible = unit.filter(index => candidates.has(index));
    if (possible.length === 1) return { index: possible[0], value: "q" };
  }

  for (const source of units) {
    if (source.some(index => state[index] === "q")) continue;
    const possible = source.filter(index => candidates.has(index));
    if (possible.length < 2 || possible.length > 4) continue;
    for (const target of units) {
      if (target === source || !possible.every(index => target.includes(index))) continue;
      const elimination = target.find(index => state[index] === "" && candidates.has(index) && !possible.includes(index));
      if (elimination != null) return { index: elimination, value: "x" };
    }
  }
  return null;
}

function candidateCells(puzzle, state) {
  const queens = queenCells(state);
  const result = new Set();
  for (let index = 0; index < state.length; index++) {
    if (state[index] === "x") continue;
    if (state[index] === "q" || queens.every(queen => !attacks(puzzle, queen, index))) result.add(index);
  }
  return result;
}

function allUnits(puzzle) {
  const size = puzzle.size;
  const output = [];
  for (let row = 0; row < size; row++) output.push([...Array(size)].map((_, col) => row * size + col));
  for (let col = 0; col < size; col++) output.push([...Array(size)].map((_, row) => row * size + col));
  for (const region of new Set(puzzle.regions)) {
    output.push([...puzzle.regions].map((value, index) => value === region ? index : -1).filter(index => index >= 0));
  }
  return output;
}

function attacks(puzzle, first, second) {
  if (first === second) return false;
  const size = puzzle.size;
  const firstRow = Math.floor(first / size), firstCol = first % size;
  const secondRow = Math.floor(second / size), secondCol = second % size;
  return firstRow === secondRow
    || firstCol === secondCol
    || puzzle.regions[first] === puzzle.regions[second]
    || Math.max(Math.abs(firstRow - secondRow), Math.abs(firstCol - secondCol)) <= 1;
}

function stateSolved(puzzle, state) {
  const answer = new Set([...puzzle.solution].map((value, index) => value === "Q" ? index : -1).filter(index => index >= 0));
  return state.every((value, index) => answer.has(index) ? value === "q" : value !== "q");
}

function queenCells(state) {
  return state.map((value, index) => value === "q" ? index : -1).filter(index => index >= 0);
}

function canonicalShape(regions, size) {
  const variants = transforms.map(([, transform]) => {
    const output = Array(size * size);
    for (let index = 0; index < regions.length; index++) {
      const row = Math.floor(index / size);
      const col = index % size;
      const [nextRow, nextCol] = transform(row, col, size);
      output[nextRow * size + nextCol] = regions[index];
    }
    const map = new Map();
    let next = 0;
    return output.map(label => {
      if (!map.has(label)) map.set(label, ALPHABET[next++]);
      return map.get(label);
    }).join("");
  });
  variants.sort();
  return variants[0];
}

function solutionColumns(solution, size) {
  return [...Array(size)].map((_, row) => solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
