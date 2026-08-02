/* ==========================================================================
   SleepGuard AI Extension — Content Script Bridge
   Injected into web pages to bridge postMessage with chrome.runtime
   ========================================================================== */

// Listen for window postMessages from SleepGuard web app
window.addEventListener('message', (event) => {
  // Only accept messages from same window and matching source
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== 'SLEEPGUARD_WEB_APP') return;

  if (data.type === 'SLEEPGUARD_PING') {
    // Reply PONG to web app to confirm extension is installed & active
    window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');
  } 
  else if (data.type === 'TRIGGER_CLOSE') {
    console.log('[SleepGuard Content Script] Relaying close command to background:', data.action);
    chrome.runtime.sendMessage({
      type: 'SLEEPGUARD_CLOSE_ACTION',
      action: data.action || 'tab'
    }, (response) => {
      console.log('[SleepGuard Content Script] Background response:', response);
    });
  }
});

// Announce presence on initial load
window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');
