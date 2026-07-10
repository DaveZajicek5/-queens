import { PUZZLES } from "./puzzles.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const modeEl = document.querySelector("#randomMode");
const sizeEl = document.querySelector("#randomSize");
const buttonEl = document.querySelector("#randomButton");
const selectEl = document.querySelector("#puzzleSelect");
const statusEl = document.querySelector("#status");

let serial = 0;
const basePoolCache = new Map();

function refreshSizes() {
  const available = [...new Set(PUZZLES.map(puzzle => puzzle.size))].filter(size => size === 7 || size === 8).sort();
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
  statusEl.textContent = `Building a new ${size}×${size} board from region mutations…`;

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

  let bestFallback = null;
  const maxAttempts = 900;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const base = bases[Math.floor(Math.random() * bases.length)];
    const mutationsWanted = 1 + Math.floor(Math.random() * 4);
    const mutated = mutateRegions(base, mutationsWanted);
    if (!mutated || mutated.regions === base.regions) continue;

    const solutions = solveExact(size, mutated.regions, 2);
    if (solutions.length !== 1) continue;

    const solution = indicesToSolution(solutions[0], size);
    const puzzle = {
      id: `generated-${size}-${Date.now()}-${++serial}`,
      day: null,
      size,
      source: "generated mutation",
      generator: "archive-region-mutation-v2",
      templateDay: base.day ?? null,
      mutationCount: mutated.count,
      generatedAttempts: attempt,
      regions: mutated.regions,
      solution,
      solutionCols: solutionColumns(solution, size),
      unique: true,
    };

    const path = basicHumanPath(puzzle);
    if (path.solved) {
      puzzle.humanSteps = path.steps;
      puzzle.maxTechnique = path.maxTechnique;
      return puzzle;
    }

    if (!bestFallback && path.steps >= size * 2) bestFallback = puzzle;
    if (attempt % 40 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  // A unique mutated board is still preferable to silently falling back to a rotation,
  // but normal hints may not cover every step on this rare fallback.
  if (bestFallback) {
    bestFallback.source = "generated mutation · advanced";
    return bestFallback;
  }
  throw new Error(`Could not find a valid mutated ${size}×${size} board. Try once more.`);
}

function getBasePool(size) {
  if (basePoolCache.has(size)) return basePoolCache.get(size);
  const pool = PUZZLES.filter(puzzle => {
    if (puzzle.size !== size || puzzle.unique === false) return false;
    if (!validPuzzleShape(puzzle)) return false;
    const path = basicHumanPath(puzzle);
    return path.solved;
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

function mutateRegions(base, wanted) {
  const size = base.size;
  const regions = [...base.regions];
  const queenCells = new Set([...base.solution].map((value, index) => value === "Q" ? index : -1).filter(index => index >= 0));
  let count = 0;

  for (let step = 0; step < wanted * 12 && count < wanted; step++) {
    const candidates = boundaryCells(regions, size).filter(index => !queenCells.has(index));
    if (!candidates.length) break;
    const cell = candidates[Math.floor(Math.random() * candidates.length)];
    const from = regions[cell];
    const targets = [...new Set(neighbours(cell, size).map(index => regions[index]).filter(region => region !== from))];
    shuffle(targets);

    let moved = false;
    for (const target of targets) {
      if (!sourceRemainsConnected(regions, size, from, cell)) continue;
      const old = regions[cell];
      regions[cell] = target;
      if (!reasonableRegionSizes(regions, size)) {
        regions[cell] = old;
        continue;
      }
      moved = true;
      count++;
      break;
    }
    if (!moved) continue;
  }

  return count > 0 ? { regions: regions.join(""), count } : null;
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
  const seen = new Set([remaining[0]]);
  const stack = [remaining[0]];
  while (stack.length) {
    const current = stack.pop();
    for (const next of neighbours(current, size)) {
      if (next === removed || regions[next] !== source || seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen.size === remaining.length;
}

function reasonableRegionSizes(regions, size) {
  const counts = new Map();
  for (const region of regions) counts.set(region, (counts.get(region) ?? 0) + 1);
  return [...counts.values()].every(count => count >= 2 && count <= size + 5);
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

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}
