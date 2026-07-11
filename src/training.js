const board = document.querySelector('#board');
const hintButton = document.querySelector('#hintButton');
const status = document.querySelector('#status');
const trainingToggle = document.querySelector('#trainingToggle');
const trainingDelay = document.querySelector('#trainingDelay');
const trainingPanel = document.querySelector('#trainingPanel');
const trainingProgress = document.querySelector('#trainingProgress');
const trainingMessage = document.querySelector('#trainingMessage');
const trainingSkip = document.querySelector('#trainingSkip');

const STORAGE_KEY = 'queens-training:v1';
let enabled = false;
let deadline = 0;
let timer = null;
let revealing = false;
let waitingForBoard = false;
let stepStartedAt = 0;
let lastBoardSignature = '';
let stats = loadStats();

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { attempts: [], techniques: {} };
  } catch {
    return { attempts: [], techniques: {} };
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function boardSignature() {
  return [...board.querySelectorAll('.cell')].map(cell => cell.dataset.state || '.').join('');
}

function currentDelay() {
  return Number(trainingDelay.value || 5) * 1000;
}

function startStep() {
  if (!enabled || revealing) return;
  stepStartedAt = performance.now();
  deadline = stepStartedAt + currentDelay();
  waitingForBoard = false;
  lastBoardSignature = boardSignature();
  trainingMessage.textContent = 'Najdi další logický krok.';
  paint();
}

function paint() {
  if (!enabled) return;
  const remaining = Math.max(0, deadline - performance.now());
  trainingProgress.style.setProperty('--progress', `${remaining / currentDelay() * 100}%`);
  trainingProgress.textContent = `${(remaining / 1000).toFixed(1)} s`;
  if (!revealing && remaining <= 0) revealAndDemonstrate();
}

function tick() {
  paint();
}

function record(technique, ms, assisted) {
  const key = technique || 'Unknown';
  const item = stats.techniques[key] || { attempts: 0, clean: 0, assisted: 0, totalMs: 0, bestMs: null };
  item.attempts++;
  item[assisted ? 'assisted' : 'clean']++;
  item.totalMs += ms;
  item.bestMs = item.bestMs == null ? ms : Math.min(item.bestMs, ms);
  stats.techniques[key] = item;
  stats.attempts.push({ at: new Date().toISOString(), technique: key, ms, assisted });
  if (stats.attempts.length > 500) stats.attempts.splice(0, stats.attempts.length - 500);
  saveStats();
}

function techniqueFromStatus() {
  return status.querySelector('.technique')?.textContent?.trim() || 'Logical step';
}

async function revealAndDemonstrate() {
  if (!enabled || revealing) return;
  revealing = true;
  trainingMessage.textContent = 'Sleduj: modře je důvod, žlutě správný tah.';
  hintButton.click();
  await sleep(300);
  const target = board.querySelector('.hint-target');
  if (!target) {
    revealing = false;
    trainingMessage.textContent = 'Solver nenašel jednoduchý krok. Přeskakuji.';
    setTimeout(startStep, 900);
    return;
  }
  const technique = techniqueFromStatus();
  const action = target.dataset.hintAction;
  target.animate([
    { transform: 'scale(1)', boxShadow: 'inset 0 0 0 5px #facc15' },
    { transform: 'scale(1.10)', boxShadow: 'inset 0 0 0 7px #facc15' },
    { transform: 'scale(1)', boxShadow: 'inset 0 0 0 5px #facc15' }
  ], { duration: 650, easing: 'ease-in-out' });
  await sleep(900);
  applyAction(target, action);
  record(technique, currentDelay(), true);
  trainingMessage.textContent = `${technique}: tah byl předveden. Pokračuj.`;
  await sleep(450);
  revealing = false;
  startStep();
}

function applyAction(cell, action) {
  const desired = action === 'q' ? 'q' : action === 'x' ? 'x' : '';
  for (let i = 0; i < 3 && (cell.dataset.state || '') !== desired; i++) cell.click();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toggleTraining() {
  enabled = !enabled;
  trainingToggle.textContent = enabled ? 'Training: On' : 'Training: Off';
  trainingToggle.classList.toggle('active', enabled);
  trainingPanel.hidden = !enabled;
  if (enabled) {
    timer = setInterval(tick, 50);
    startStep();
  } else {
    clearInterval(timer);
    timer = null;
    revealing = false;
  }
}

trainingToggle.addEventListener('click', toggleTraining);
trainingDelay.addEventListener('change', startStep);
trainingSkip.addEventListener('click', revealAndDemonstrate);

board.addEventListener('click', event => {
  if (!enabled || revealing || !event.target.closest('.cell')) return;
  setTimeout(() => {
    const signature = boardSignature();
    if (signature === lastBoardSignature) return;
    const elapsed = performance.now() - stepStartedAt;
    record('Self-found step', elapsed, false);
    trainingMessage.textContent = `Krok nalezen za ${(elapsed / 1000).toFixed(2)} s.`;
    startStep();
  }, 0);
});

new MutationObserver(() => {
  if (!enabled || revealing || waitingForBoard) return;
  const signature = boardSignature();
  if (signature.length && signature !== lastBoardSignature) lastBoardSignature = signature;
}).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
