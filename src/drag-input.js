const board = document.querySelector("#board");

let activePointer = null;
let visited = new Set();
let suppressClickUntil = 0;

board.style.touchAction = "none";

board.addEventListener("pointerdown", event => {
  const cell = event.target.closest(".cell");
  if (!cell || event.button > 0) return;

  event.preventDefault();
  activePointer = event.pointerId;
  visited = new Set();
  board.setPointerCapture?.(event.pointerId);
  applyCell(cell);
}, true);

board.addEventListener("pointermove", event => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const cell = element?.closest?.(".cell");
  if (cell && board.contains(cell)) applyCell(cell);
}, true);

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  board.addEventListener(type, event => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    activePointer = null;
    suppressClickUntil = performance.now() + 350;
    visited.clear();
  }, true);
}

board.addEventListener("click", event => {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

function applyCell(cell) {
  const index = cell.dataset.index ?? cell.getAttribute("data-index") ?? cell.getAttribute("aria-label");
  if (visited.has(index)) return;
  visited.add(index);

  // The game re-renders after every click, so trigger the existing game logic
  // rather than duplicating its state handling here.
  cell.click();
}
