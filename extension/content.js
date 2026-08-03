/* ==========================================================================
   SleepGuard AI Extension — Content Script Bridge
   Bridges postMessage (web app) ↔ chrome.runtime (background worker)
   ========================================================================== */

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'SLEEPGUARD_WEB_APP') return;

  // --- PING: Extension alive check ---
  if (data.type === 'SLEEPGUARD_PING') {
    window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');

  // --- TRIGGER_CLOSE: Real protection action ---
  } else if (data.type === 'TRIGGER_CLOSE' || data.action === 'CLOSE_PROTECTED_TABS') {
    console.log('[SleepGuard CS] Relaying TRIGGER_CLOSE to background:', data);
    chrome.runtime.sendMessage({
      type: 'SLEEPGUARD_CLOSE_ACTION',
      actionScope: data.actionScope || 'protected',
      protectedDomains: data.protectedDomains || [],
      protectAllOtherTabs: data.protectAllOtherTabs === true,
      closeSleepGuardPage: data.closeSleepGuardPage === true
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[SleepGuard CS] Background error:', chrome.runtime.lastError.message);
        return;
      }
      console.log('[SleepGuard CS] Background response:', response);
    });

  // --- DRY RUN: Preview what would be closed ---
  } else if (data.type === 'SLEEPGUARD_DRY_RUN') {
    console.log('[SleepGuard CS] Dry run preview request');
    chrome.runtime.sendMessage({
      type: 'SLEEPGUARD_CLOSE_DRY_RUN',
      protectedDomains: data.protectedDomains || [],
      protectAllOtherTabs: data.protectAllOtherTabs === true
    }, (response) => {
      if (chrome.runtime.lastError) return;
      // Forward result back to web page
      window.postMessage({
        source: 'SLEEPGUARD_EXTENSION',
        type: 'SLEEPGUARD_DRY_RUN_RESULT',
        wouldClose: response?.wouldClose || [],
        wouldKeep: response?.wouldKeep || []
      }, '*');
    });
  }
});

// --- Listen for messages FROM background (relay to web app) ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SLEEPGUARD_TABS_CLOSED') {
    window.postMessage({
      source: 'SLEEPGUARD_EXTENSION',
      type: 'SLEEPGUARD_TABS_CLOSED',
      closedCount: message.closedCount || 0,
      report: message.report || {}
    }, '*');
  }
});

// Announce presence on load
window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');
