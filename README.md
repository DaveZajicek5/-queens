# Queens Archive

A tiny offline-friendly Queens player/importer/generator for mobile.

It can import solved LinkedIn Queens-style boards from HTML blocks like the ones on `zipgameonline.com/linkedin-queens-answers/day-583`, serialize them, and play them on mobile without a daily limit. Random mode now uses real imported archive boards as templates, then applies random symmetries and region relabeling so generation is instant and still Queens-like.

## Features

- Archive picker for imported days.
- Reliable random 7×7, 8×8, and 9×9 mode based on archive-template shuffling.
- Random transforms: rotations, mirrors, transposes, and color/region relabeling.
- Square/cube-style X and queen marks.
- Thick outer borders around each same-color region.
- Timer that starts on the first move.
- Check mode that highlights conflicts and wrong marks.
- Hint mode with simple logical hints first, then a solver-backed forced-completion hint if needed.
- Show/hide solution.
- Local solve history, best time, hint count, play rating, visual rating.
- JSON stats export.

## Data model

Each archived puzzle is stored as:

```js
{
  id: "zipgame-day-583",
  day: 583,
  size: 8,
  regions: "0000112200001122...",
  solution: "...Q..........Q...",
  solutionCols: [4, 7, 5, 3, 1, 6, 8, 2],
  url: "https://zipgameonline.com/linkedin-queens-answers/day-583",
  unique: true
}
```

`regions` is row-major. Each character is the color/region id of one cell.  
`solution` is also row-major, with `Q` for queens and `.` for empty cells.

Random-template puzzles are created only in the browser session. They add fields like `templateDay`, `templateId`, and `transformName`.

## Run locally

No build step is needed.

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

On iPhone, deploy the folder through GitHub Pages or any static host, open it in Safari, then use **Share → Add to Home Screen**.

## Import a saved HTML block

```bash
node tools/import-zipgame-queens.mjs local "Vlozeny text.txt" 583 --out src/puzzles.js
```

The importer reads:

- `cell-color-X` as the region id
- `aria-label="Queen cell, row R, column C"` as the queen position
- `aria-label="Empty cell, row R, column C"` as an empty cell

It also validates that the solution has one queen per row, column, and region, with no adjacent queens, and checks whether the region layout has a unique solution.

## Scrape an archive range

```bash
node tools/import-zipgame-queens.mjs scrape 583 801 --out src/puzzles.js
```

The script skips pages it cannot parse or fetch. If the public archive only exposes a smaller range, the output will contain only the available days.

## Random mode

The default random mode is intentionally template-based rather than fully procedural:

1. choose a real imported board of the requested size,
2. apply one random symmetry: rotate, mirror, transpose, etc.,
3. relabel all color regions,
4. keep the transformed solution in memory.

This avoids the earlier failure mode where a procedural generator could find unique boards but fail the incomplete human-solver filter. The result is not a brand-new hand-authored puzzle, but it is fast, varied, and preserves the structure of real imported Queens boards.

Solve/rating data is stored locally in `localStorage` and can be exported as JSON from the UI.
