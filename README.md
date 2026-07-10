# Queens Archive

A tiny offline-friendly Queens player/importer.

Current goal: import solved LinkedIn Queens-style boards from HTML blocks like the ones on `zipgameonline.com/linkedin-queens-answers/day-583`, serialize them, and play them on mobile without a daily limit.

## Data model

Each puzzle is stored as:

```js
{
  id: "zipgame-day-583",
  day: 583,
  size: 8,
  regions: "0000112200001122...",
  solution: "...Q..........Q...",
  solutionCols: [4, 7, 5, 3, 1, 6, 8, 2],
  url: "https://zipgameonline.com/linkedin-queens-answers/day-583"
}
```

`regions` is row-major. Each character is the color/region id of one cell.  
`solution` is also row-major, with `Q` for queens and `.` for empty cells.

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

## Next steps

- Add imported days 583+ as `src/puzzles.js`.
- Add GitHub Pages deployment.
- Add a generated-puzzle mode using the same solver.
- Add local progress/history storage.
