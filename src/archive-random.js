import { PUZZLES } from "./puzzles.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BAG_KEY = "queens-archive-shuffle-bags:v1";
const RECENT_KEY = "queens-archive-recent:v1";
const modeEl = document.querySelector("#randomMode");
const sizeEl = document.querySelector("#randomSize");
const buttonEl = document.querySelector("#randomButton");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");

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

buttonEl.addEventListener("click", event => {
  if (modeEl?.value !== "archive") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const size = Number(sizeEl.value);
  buttonEl.disabled = true;
  const previous = buttonEl.textContent;
  buttonEl.textContent = "Choosing…";

  requestAnimationFrame(() => {
    try {
      const base = nextTemplate(size);
      const puzzle = transformPuzzle(base);
      PUZZLES.push(puzzle);
      const option = document.createElement("option");
      option.value = puzzle.id;
      option.textContent = `Random ${size}×${size} · day ${base.day}`;
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

function archivePool(size) {
  const seen = new Set();
  const pool = [];
  for (const puzzle of PUZZLES) {
    if (puzzle.size !== size || puzzle.day == null || puzzle.unique === false) continue;
    const key = canonicalShape(puzzle.regions, size);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(puzzle);
  }
  return pool;
}

function nextTemplate(size) {
  const pool = archivePool(size);
  if (!pool.length) throw new Error(`No ${size}×${size} archive boards are loaded.`);

  const bags = readJson(BAG_KEY, {});
  const recent = readJson(RECENT_KEY, {});
  const validIds = new Set(pool.map(puzzle => puzzle.id));
  let bag = Array.isArray(bags[size]) ? bags[size].filter(id => validIds.has(id)) : [];
  const recentIds = Array.isArray(recent[size]) ? recent[size].filter(id => validIds.has(id)) : [];

  if (!bag.length) {
    const blocked = new Set(recentIds.slice(-Math.min(30, Math.max(0, pool.length - 1))));
    const preferred = shuffle(pool.map(puzzle => puzzle.id).filter(id => !blocked.has(id)));
    const delayed = shuffle(pool.map(puzzle => puzzle.id).filter(id => blocked.has(id)));
    bag = [...preferred, ...delayed];
  }

  const id = bag.shift();
  bags[size] = bag;
  recent[size] = [...recentIds, id].slice(-40);
  localStorage.setItem(BAG_KEY, JSON.stringify(bags));
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  return pool.find(puzzle => puzzle.id === id) ?? pool[0];
}

function transformPuzzle(base) {
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
    id: `archive-random-${n}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    day: null,
    size: n,
    source: "archive shuffle bag",
    templateDay: base.day,
    transformName,
    regions: regions.map(label => map.get(label)).join(""),
    solution: solution.join(""),
    solutionCols: solutionColumns(solution.join(""), n),
    unique: true,
  };
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
