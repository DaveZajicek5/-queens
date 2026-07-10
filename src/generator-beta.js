import { PUZZLES } from "./puzzles.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RECENT_KEY = "queens-generated-recent:v1";
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

const modeEl = document.querySelector("#randomMode");
const sizeEl = document.querySelector("#randomSize");
const buttonEl = document.querySelector("#randomButton");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");

let serial = 0;
const basePoolCache = new Map();

function refreshSizes() {
  const available = [...new Set(PUZZLES.map(puzzle => puzzle.size))]
    .filter(size => size === 7 || size === 8)
    .sort();
  const current = Number(sizeEl.value);
  sizeEl.innerHTML = available.map(size => `<option value="${size}">${size}×${size}</option>`).join("");
  sizeEl.value = available.includes(current) ? String(current) : String(available.includes(8) ? 8 : available[0]);
  buttonEl.textContent = modeEl.value === "generated" ? "Generate" : "New random";
}

modeEl.addEventListener("change", refreshSizes);
refreshSizes();

buttonEl.addEventListener("click", async event => {
  if (modeEl.value !== "generated") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const size = Number(sizeEl.value);
  buttonEl.disabled = true;
  buttonEl.textContent = "Generating…";
  statusEl.className = "status";
  statusEl.textContent = `Building a distinct ${size}×${size} board…`;

  try {
    const puzzle = await generateMutatedPuzzle(size);
    PUZZLES.push(puzzle);
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = `Generated · ${size}×${size} · ${puzzle.mutationCount} changes`;
    selectEl.prepend(option);
    selectEl.value = puzzle.id;
    selectEl.dispatchEvent(new Event("change"));
  } catch (error) {
    statusEl.className = "status bad";
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = "Generate";
  }
}, true);

async function generateMutatedPuzzle(size) {
  const bases = getBasePool(size);
  if (!bases.length) throw new Error(`No verified ${size}×${size} source boards are available.`);

  const recent = readRecent();
  const freshBases = bases.filter(base => !recent.includes(base.id));
  const base = randomItem(freshBases.length ? freshBases : bases);
  const transformed = transformPuzzle(base, randomItem(TRANSFORMS));

  let current = transformed;
  let accepted = 0;
  const target = size === 8 ? 8 + randomInt(0, 5) : 6 + randomInt(0, 5);
  const maxTrials = size === 8 ? 1800 : 1200;

  for (let trial = 1; trial <= maxTrials && accepted < target; trial++) {
    const proposal = proposeSingleMutation(current);
    if (!proposal) continue;

    const solutions = solveExact(size, proposal.regions, 2);
    if (solutions.length !== 1) continue;

    proposal.solution = indicesToSolution(solutions[0], size);
    proposal.solutionCols = solutionColumns(proposal.solution, size);
    const path = basicHumanPath(proposal);
    if (!path.solved) continue;

    current = proposal;
    current.humanSteps = path.steps;
    current.maxTechnique = path.maxTechnique;
    accepted++;

    if (trial % 45 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  // A generated board must differ materially from its transformed source.
  // If the target was too ambitious, return the best valid chain rather than an error.
  if (accepted === 0) {
    // The transformed source is still playable, but label it honestly.
    current.source = "generated transform fallback";
  } else {
    current.source = accepted >= Math.min(target, 6) ? "generated mutation" : "generated light mutation";
  }

  current.id = `generated-${size}-${Date.now()}-${++serial}`;
  current.day = null;
  current.generator = "iterative-region-mutation-v3";
  current.templateDay = base.day ?? null;
  current.templateId = base.id;
  current.transformName = transformed.transformName;
  current.mutationCount = accepted;
  current.unique = true;

  rememberBase(base.id);
  return current;
}

function getBasePool(size) {
  if (basePoolCache.has(size)) return basePoolCache.get(size);
  const pool = PUZZLES.filter(puzzle => {
    if (puzzle.size !== size || puzzle.unique === false || !validPuzzleShape(puzzle)) return false;
    return basicHumanPath(puzzle).solved;
  });
  basePoolCache.set(size, pool);
  return pool;
}

function validPuzzleShape(puzzle) {
  const total = puzzle.size * puzzle.size;
  return puzzle.regions?.length === total
    && puzzle.solution?.length === total
    && new Set(puzzle.regions).size === puzzle.size
    && [...puzzle.solution].filter(value => value === "Q").length === puzzle.size;
}

function transformPuzzle(base, transform) {
  const [name, fn] = transform;
  const size = base.size;
  const regions = Array(size * size);
  const solution = Array(size * size).fill(".");

  for (let index = 0; index < size * size; index++) {
    const row = Math.floor(index / size);
    const col = index % size;
    const [nextRow, nextCol] = fn(row, col, size);
    const next = nextRow * size + nextCol;
    regions[next] = base.regions[index];
    if (base.solution[index] === "Q") solution[next] = "Q";
  }

  const labels = [...new Set(regions)];
  const shuffled = shuffle(ALPHABET.slice(0, labels.length).split(""));
  const relabel = new Map(labels.map((label, index) => [label, shuffled[index]]));

  return {
    id: "working",
    size,
    day: null,
    source: "generated working",
    regions: regions.map(label => relabel.get(label)).join(""),
    solution: solution.join(""),
    solutionCols: solutionColumns(solution.join(""), size),
    unique: true,
    transformName: name,
  };
}

function proposeSingleMutation(puzzle) {
  const size = puzzle.size;
  const regions = [...puzzle.regions];
  const queens = new Set([...puzzle.solution].map((value, index) => value === "Q" ? index : -1).filter(index => index >= 0));
  const candidates = shuffle(boundaryCells(regions, size).filter(index => !queens.has(index)));

  for (const cell of candidates) {
    const from = regions[cell];
    const targets = shuffle([...new Set(neighbours(cell, size).map(index => regions[index]).filter(region => region !== from))]);
    for (const target of targets) {
      if (!sourceRemainsConnected(regions, size, from, cell)) continue;
      const next = [...regions];
      next[cell] = target;
      if (!reasonableRegionSizes(next, size)) continue;
      if (!allRegionsConnected(next, size)) continue;
      return { ...puzzle, regions: next.join("") };
    }
  }
  return null;
}

function boundaryCells(regions, size) {
  const output = [];
  for (let index = 0; index < regions.length; index++) {
    if (neighbours(index, size).some(other => regions[other] !== regions[index])) output.push(index);
  }
  return output;
}

function sourceRemainsConnected(regions, size, source, removed) {
  const remaining = regions.map((region, index) => region === source && index !== removed ? index : -1).filter(index => index >= 0);
  if (!remaining.length) return false;
  return connectedCount(regions, size, source, remaining[0], removed) === remaining.length;
}

function allRegionsConnected(regions, size) {
  for (const region of new Set(regions)) {
    const cells = regions.map((value, index) => value === region ? index : -1).filter(index => index >= 0);
    if (!cells.length || connectedCount(regions, size, region, cells[0], -1) !== cells.length) return false;
  }
  return true;
}

function connectedCount(regions, size, region, start, blocked) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const next of neighbours(current, size)) {
      if (next === blocked || regions[next] !== region || seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen.size;
}

function reasonableRegionSizes(regions, size) {
  const counts = new Map();
  for (const region of regions) counts.set(region, (counts.get(region) ?? 0) + 1);
  return [...counts.values()].every(count => count >= 2 && count <= size + 6);
}

function solveExact(size, regions, limit = 2) {
  const labels = [...new Set(regions)];
  if (labels.length !== size) return [];
  const regionMap = new Map(labels.map((label, index) => [label, index]));
  const solutions = [];
  const placed = [];

  function walk(row, usedCols, usedRegions) {
    if (solutions.length >= limit) return;
    if (row === size) {
      if (usedRegions.size === size) solutions.push([...placed]);
      return;
    }
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      const region = regionMap.get(regions[index]);
      if (usedCols.has(col) || usedRegions.has(region)) continue;
      const previous = placed[placed.length - 1];
      if (previous != null && Math.abs(previous % size - col) <= 1) continue;
      placed.push(index);
      usedCols.add(col);
      usedRegions.add(region);
      walk(row + 1, usedCols, usedRegions);
      usedCols.delete(col);
      usedRegions.delete(region);
      placed.pop();
    }
  }

  walk(0, new Set(), new Set());
  return solutions;
}

function basicHumanPath(puzzle) {
  const state = Array(puzzle.size * puzzle.size).fill("");
  let steps = 0;
  let maxTechnique = 0;
  const guardLimit = puzzle.size * puzzle.size * 4;
  for (let guard = 0; guard < guardLimit; guard++) {
    if (stateSolved(puzzle, state)) return { solved: true, steps, maxTechnique };
    const deduction = nextBasicDeduction(puzzle, state);
    if (!deduction || state[deduction.index] === deduction.value) return { solved: false, steps, maxTechnique };
    state[deduction.index] = deduction.value;
    steps++;
    maxTechnique = Math.max(maxTechnique, deduction.level);
  }
  return { solved: stateSolved(puzzle, state), steps, maxTechnique };
}

function nextBasicDeduction(puzzle, state) {
  const queens = queenCells(state);
  for (const queen of queens) {
    for (let index = 0; index < state.length; index++) {
      if (state[index] === "" && attacks(puzzle, queen, index)) return { index, value: "x", level: 1 };
    }
  }

  const candidates = candidateCells(puzzle, state);
  for (const unit of allUnits(puzzle)) {
    if (unit.some(index => state[index] === "q")) continue;
    const possible = unit.filter(index => candidates.has(index));
    if (possible.length === 1) return { index: possible[0], value: "q", level: 1 };
  }

  const units = allUnits(puzzle);
  for (const source of units) {
    if (source.some(index => state[index] === "q")) continue;
    const possible = source.filter(index => candidates.has(index));
    if (possible.length < 2 || possible.length > 4) continue;
    for (const target of units) {
      if (target === source || !possible.every(index => target.includes(index))) continue;
      const elimination = target.find(index => state[index] === "" && candidates.has(index) && !possible.includes(index));
      if (elimination != null) return { index: elimination, value: "x", level: 2 };
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
  for (const region of new Set(puzzle.regions)) output.push([...puzzle.regions].map((value, index) => value === region ? index : -1).filter(index => index >= 0));
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

function neighbours(index, size) {
  const row = Math.floor(index / size), col = index % size;
  const output = [];
  if (row > 0) output.push(index - size);
  if (row + 1 < size) output.push(index + size);
  if (col > 0) output.push(index - 1);
  if (col + 1 < size) output.push(index + 1);
  return output;
}

function indicesToSolution(indices, size) {
  const result = Array(size * size).fill(".");
  for (const index of indices) result[index] = "Q";
  return result.join("");
}

function solutionColumns(solution, size) {
  return [...Array(size)].map((_, row) => solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
}

function readRecent() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function rememberBase(id) {
  const next = [id, ...readRecent().filter(value => value !== id)].slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
