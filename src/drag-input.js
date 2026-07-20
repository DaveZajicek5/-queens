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
  // Cells are recreated after every move, so derive the stable board position
  // from current DOM order rather than retaining the element itself.
  const index = Array.prototype.indexOf.call(board.children, cell);
  if (index < 0 || visited.has(index)) return;
  visited.add(index);

  // Trigger the main game's click handler so timer, hints and validation remain
  // governed by the existing state logic.
  cell.click();
}
