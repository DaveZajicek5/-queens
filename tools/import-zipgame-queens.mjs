#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function usage() {
  console.error(`Usage:\n  node tools/import-zipgame-queens.mjs local <html-file> <day> [--out src/puzzles.js]\n  node tools/import-zipgame-queens.mjs scrape <from-day> <to-day> [--out src/puzzles.js]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = [...argv];
  const outIndex = args.indexOf("--out");
  let out = null;
  if (outIndex >= 0) {
    out = args[outIndex + 1];
    args.splice(outIndex, 2);
  }
  return { args, out };
}

export function parseQueensHtml(html, meta = {}) {
  const declaredSize = Number(html.match(/grid-template-columns:\s*repeat\((\d+)/)?.[1] ?? 0) || null;
  const capturedMatch = html.match(/Captured\s+([^<\n]+)/i);
  const tagRe = /<div\b(?=[^>]*cell-color-\d+)(?=[^>]*aria-label="(?:Empty|Queen) cell, row \d+, column \d+")[^>]*>/g;
  const cells = [];

  for (const match of html.matchAll(tagRe)) {
    const tag = match[0];
    const color = tag.match(/cell-color-(\d+)/)?.[1];
    const label = tag.match(/aria-label="(Empty|Queen) cell, row (\d+), column (\d+)"/);
    if (!color || !label) continue;
    cells.push({
      row: Number(label[2]),
      col: Number(label[3]),
      region: Number(color),
      queen: label[1] === "Queen",
    });
  }

  if (!cells.length) throw new Error("No Queens cells found. Save rendered HTML, not just visible text.");

  const inferredSize = Math.sqrt(cells.length);
  const size = declaredSize ?? inferredSize;
  if (!Number.isInteger(size) || size * size !== cells.length) {
    throw new Error(`Expected a square board; got ${cells.length} cells.`);
  }

  const regions = Array(size * size).fill(null);
  const solution = Array(size * size).fill(".");
  for (const cell of cells) {
    const idx = (cell.row - 1) * size + (cell.col - 1);
    regions[idx] = ALPHABET[cell.region] ?? String.fromCharCode(65 + cell.region);
    if (cell.queen) solution[idx] = "Q";
  }
  if (regions.some(v => v == null)) throw new Error("Some grid positions were not parsed.");

  const puzzle = {
    id: meta.day ? `zipgame-day-${meta.day}` : `imported-${Date.now()}`,
    source: "zipgameonline",
    day: meta.day ?? null,
    size,
    capturedAt: normalizeCapturedAt(capturedMatch?.[1]),
    regions: regions.join(""),
    solution: solution.join(""),
    solutionCols: solutionToCols(solution.join(""), size),
    url: meta.url ?? null,
  };

  validatePuzzle(puzzle);
  const count = countSolutions(puzzle, 2);
  puzzle.unique = count === 1;
  puzzle.solutionCountChecked = count;
  return puzzle;
}

function normalizeCapturedAt(value) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\.$/, "");
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function solutionToCols(solution, size) {
  const cols = [];
  for (let row = 0; row < size; row++) {
    cols.push(solution.slice(row * size, (row + 1) * size).indexOf("Q") + 1);
  }
  return cols;
}

export function validatePuzzle(puzzle) {
  const n = puzzle.size;
  if (puzzle.regions.length !== n * n) throw new Error(`${puzzle.id}: bad regions length`);
  if (puzzle.solution.length !== n * n) throw new Error(`${puzzle.id}: bad solution length`);

  const queens = [];
  for (let i = 0; i < puzzle.solution.length; i++) if (puzzle.solution[i] === "Q") queens.push(i);
  if (queens.length !== n) throw new Error(`${puzzle.id}: expected ${n} queens, got ${queens.length}`);

  const rows = new Set(), cols = new Set(), regions = new Set();
  for (const idx of queens) {
    const row = Math.floor(idx / n), col = idx % n;
    rows.add(row);
    cols.add(col);
    regions.add(puzzle.regions[idx]);
  }
  if (rows.size !== n) throw new Error(`${puzzle.id}: duplicate queen row`);
  if (cols.size !== n) throw new Error(`${puzzle.id}: duplicate queen column`);
  if (regions.size !== n) throw new Error(`${puzzle.id}: duplicate queen region`);

  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i], b = queens[j];
      const ar = Math.floor(a / n), ac = a % n;
      const br = Math.floor(b / n), bc = b % n;
      if (Math.max(Math.abs(ar - br), Math.abs(ac - bc)) <= 1) {
        throw new Error(`${puzzle.id}: adjacent queens`);
      }
    }
  }
}

export function countSolutions(puzzle, limit = 2) {
  const n = puzzle.size;
  const regionValues = [...new Set([...puzzle.regions])];
  const regionIndex = new Map(regionValues.map((region, i) => [region, i]));
  let count = 0;
  const placements = [];

  function backtrack(row, usedCols, usedRegions) {
    if (count >= limit) return;
    if (row === n) {
      if (usedRegions.size === n) count++;
      return;
    }
    for (let col = 0; col < n; col++) {
      const idx = row * n + col;
      const region = regionIndex.get(puzzle.regions[idx]);
      if (usedCols.has(col) || usedRegions.has(region)) continue;
      const prev = placements[placements.length - 1];
      if (prev && Math.abs(prev % n - col) <= 1) continue;
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
  return count;
}

async function writePuzzlesModule(puzzles, out) {
  const content = `export const PUZZLES = ${JSON.stringify(puzzles, null, 2)};\n`;
  if (!out) return console.log(content);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, content, "utf8");
  console.error(`Wrote ${puzzles.length} puzzle(s) to ${out}`);
}

async function parseLocal(file, day, out) {
  const html = await readFile(file, "utf8");
  const puzzle = parseQueensHtml(html, {
    day: Number(day),
    url: Number.isFinite(Number(day)) ? `https://zipgameonline.com/linkedin-queens-answers/day-${day}` : null,
  });
  await writePuzzlesModule([puzzle], out);
}

async function scrape(fromDay, toDay, out) {
  const puzzles = [];
  for (let day = Number(fromDay); day <= Number(toDay); day++) {
    const url = `https://zipgameonline.com/linkedin-queens-answers/day-${day}`;
    try {
      const response = await fetch(url, { headers: { "user-agent": "queens-archive-importer/0.1" } });
      if (!response.ok) {
        console.error(`Skip day ${day}: HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const puzzle = parseQueensHtml(html, { day, url });
      puzzles.push(puzzle);
      console.error(`Imported day ${day} (${puzzle.size}x${puzzle.size}, unique=${puzzle.unique})`);
    } catch (error) {
      console.error(`Skip day ${day}: ${error.message}`);
    }
  }
  await writePuzzlesModule(puzzles, out);
}

const { args, out } = parseArgs(process.argv.slice(2));
const [mode, a, b] = args;
if (mode === "local" && a && b) await parseLocal(a, b, out);
else if (mode === "scrape" && a && b) await scrape(a, b, out);
else usage();
