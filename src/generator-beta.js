import { PUZZLES } from "./puzzles.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const modeEl = document.querySelector("#randomMode");
const sizeEl = document.querySelector("#randomSize");
const buttonEl = document.querySelector("#randomButton");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");

let serial = 0;

function refreshSizes() {
  const generated = modeEl.value === "generated";
  const wanted = generated ? [7, 8, 9] : [7, 8];
  const current = Number(sizeEl.value);
  sizeEl.innerHTML = wanted.map(size => `<option value="${size}">${size}×${size}</option>`).join("");
  sizeEl.value = wanted.includes(current) ? String(current) : "8";
  buttonEl.textContent = generated ? "Generate beta" : "New random";
}

modeEl.addEventListener("change", refreshSizes);
refreshSizes();

buttonEl.addEventListener("click", async event => {
  if (modeEl.value !== "generated") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const size = Number(sizeEl.value);
  buttonEl.disabled = true;
  buttonEl.textContent = "Building…";
  statusEl.className = "status";
  statusEl.textContent = `Constructing a new ${size}×${size} board…`;

  try {
    const puzzle = await generatePuzzle(size);
    PUZZLES.push(puzzle);
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = `Generated beta · ${size}×${size}`;
    selectEl.prepend(option);
    selectEl.value = puzzle.id;
    selectEl.dispatchEvent(new Event("change"));
  } catch (error) {
    statusEl.className = "status bad";
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = "Generate beta";
  }
}, true);

async function generatePuzzle(size) {
  const maxAttempts = size === 9 ? 2400 : 1400;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const queens = randomQueenPlacement(size);
    if (!queens) continue;

    const regions = constructRegions(size, queens);
    if (!regions || !reasonableGeometry(regions, size)) continue;

    const encoded = encodeRegions(regions);
    const exact = solveExact(size, encoded, 2);
    if (exact.length !== 1) continue;

    const solution = indicesToSolution(exact[0], size);
    const puzzle = {
      id: `generated-beta-${size}-${Date.now()}-${++serial}`,
      day: null,
      size,
      source: "generated beta",
      generator: "queen-seeded region grammar v1",
      generatedAttempts: attempt,
      regions: encoded,
      solution,
      solutionCols: solutionColumns(solution, size),
      unique: true,
    };

    const path = basicHumanPath(puzzle);
    if (!path.solved || path.steps < size) continue;
    puzzle.humanSteps = path.steps;
    puzzle.maxTechnique = path.maxTechnique;
    return puzzle;
  }
  throw new Error(`Could not construct a clean ${size}×${size} beta board. Try again.`);
}

function randomQueenPlacement(size) {
  const cols = [];
  function place(row, used) {
    if (row === size) return true;
    for (const col of shuffle([...Array(size).keys()])) {
      if (used.has(col)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - col) <= 1) continue;
      cols[row] = col;
      used.add(col);
      if (place(row + 1, used)) return true;
      used.delete(col);
    }
    cols.pop();
    return false;
  }
  return place(0, new Set()) ? cols.map((col, row) => row * size + col) : null;
}

// Constructive rather than free random growth:
// every region starts at its solution queen, receives a small local motif,
// then expands through weighted frontier growth while preserving connectivity.
function constructRegions(size, queens) {
  const total = size * size;
  const regions = Array(total).fill(-1);
  const counts = Array(size).fill(0);
  const targets = balancedTargets(size);

  queens.forEach((cell, region) => {
    regions[cell] = region;
    counts[region] = 1;
  });

  // Seed local motifs: give alternating regions a short orthogonal arm.
  for (const region of shuffle([...Array(size).keys()])) {
    const seed = queens[region];
    const neighbours = orthogonalNeighbours(seed, size).filter(cell => regions[cell] === -1);
    if (!neighbours.length) continue;
    const chosen = neighbours.sort((a, b) => motifScore(a, seed, size) - motifScore(b, seed, size))[0];
    regions[chosen] = region;
    counts[region]++;
  }

  let remaining = regions.filter(value => value === -1).length;
  while (remaining > 0) {
    const choices = [];
    for (let cell = 0; cell < total; cell++) {
      if (regions[cell] !== -1) continue;
      for (const region of new Set(orthogonalNeighbours(cell, size).map(n => regions[n]).filter(r => r >= 0))) {
        const seed = queens[region];
        const distance = manhattan(cell, seed, size);
        const need = Math.max(0.2, targets[region] - counts[region] + 1);
        const compactness = 1 / Math.max(1, distance);
        const sameSides = orthogonalNeighbours(cell, size).filter(n => regions[n] === region).length;
        const weight = need * compactness * (1 + sameSides * 0.65) * (0.75 + Math.random() * 0.5);
        choices.push({ cell, region, weight });
      }
    }
    if (!choices.length) return null;
    const pick = weightedChoice(choices);
    regions[pick.cell] = pick.region;
    counts[pick.region]++;
    remaining--;
  }
  return regions;
}

function balancedTargets(size) {
  const targets = Array(size).fill(size);
  for (let i = 0; i < size * 2; i++) {
    const a = Math.floor(Math.random() * size);
    const b = Math.floor(Math.random() * size);
    if (targets[a] > Math.max(3, size - 2) && targets[b] < size + 3) {
      targets[a]--;
      targets[b]++;
    }
  }
  return targets;
}

function reasonableGeometry(regions, size) {
  const counts = Array(size).fill(0);
  for (const region of regions) counts[region]++;
  if (counts.some(count => count < 3 || count > size + 4)) return false;

  let boundaries = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      if (col + 1 < size && regions[i] !== regions[i + 1]) boundaries++;
      if (row + 1 < size && regions[i] !== regions[i + size]) boundaries++;
    }
  }
  return boundaries >= size * 5;
}

function solveExact(size, regions, limit) {
  const labels = [...new Set(regions)];
  const regionMap = new Map(labels.map((label, i) => [label, i]));
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
      if (previous != null && Math.abs((previous % size) - col) <= 1) continue;
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
  for (let guard = 0; guard < puzzle.size * puzzle.size * 3; guard++) {
    if (stateSolved(puzzle, state)) return { solved: true, steps, maxTechnique };
    const deduction = nextBasicDeduction(puzzle, state);
    if (!deduction) return { solved: false, steps, maxTechnique };
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

function attacks(puzzle, a, b) {
  if (a === b) return false;
  const size = puzzle.size;
  const ar = Math.floor(a / size), ac = a % size;
  const br = Math.floor(b / size), bc = b % size;
  return ar === br || ac === bc || puzzle.regions[a] === puzzle.regions[b] || Math.max(Math.abs(ar - br), Math.abs(ac - bc)) <= 1;
}

function stateSolved(puzzle, state) {
  const answer = new Set([...puzzle.solution].map((value, index) => value === "Q" ? index : -1).filter(index => index >= 0));
  return state.every((value, index) => answer.has(index) ? value === "q" : value !== "q");
}

function queenCells(state) {
  return state.map((value, index) => value === "q" ? index : -1).filter(index => index >= 0);
}

function encodeRegions(regions) {
  return regions.map(region => ALPHABET[region]).join("");
}

function indicesToSolution(indices, size) {
  const result = Array(size * size).fill(".");
  for (const index of indices) result[index] = "Q";
  return result.join("");
}

function solutionColumns(solution, size) {
  return [...Array(size)].map((_, row) => solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
}

function orthogonalNeighbours(index, size) {
  const row = Math.floor(index / size), col = index % size;
  const result = [];
  if (row > 0) result.push(index - size);
  if (row + 1 < size) result.push(index + size);
  if (col > 0) result.push(index - 1);
  if (col + 1 < size) result.push(index + 1);
  return result;
}

function motifScore(cell, seed, size) {
  const edgePenalty = [Math.floor(cell / size), cell % size, size - 1 - Math.floor(cell / size), size - 1 - (cell % size)].filter(v => v === 0).length;
  return manhattan(cell, seed, size) - edgePenalty * 0.15 + Math.random() * 0.4;
}

function manhattan(a, b, size) {
  return Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs((a % size) - (b % size));
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

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
