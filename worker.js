/* ==========================================================================
   SleepGuard AI v3 — Background Web Worker Ticker
   Runs on a background thread unaffected by browser tab switching or throttling.
   ========================================================================== */

let timerInterval = null;
let isRunning = false;

self.onmessage = function (e) {
  const data = e.data;

  if (data.command === 'START') {
    if (isRunning) return;
    isRunning = true;
    const intervalMs = data.interval || 1000;

    timerInterval = setInterval(() => {
      self.postMessage({ type: 'TICK', timestamp: Date.now() });
    }, intervalMs);

  } else if (data.command === 'STOP') {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isRunning = false;
  }
};
