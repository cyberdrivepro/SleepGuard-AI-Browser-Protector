/* ==========================================================================
   SleepGuard AI Extension — Content Script Bridge
   Injected into web pages to bridge postMessage with chrome.runtime
   ========================================================================== */

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== 'SLEEPGUARD_WEB_APP') return;

  if (data.type === 'SLEEPGUARD_PING') {
    window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');
  } 
  else if (data.type === 'TRIGGER_CLOSE' || data.action === 'CLOSE_PROTECTED_TABS') {
    console.log('[SleepGuard Content Script] Relaying Protected Tabs close command to background:', data);
    chrome.runtime.sendMessage({
      type: 'SLEEPGUARD_CLOSE_ACTION',
      actionScope: data.actionScope || 'protected',
      protectedDomains: data.protectedDomains || ['youtube.com', 'instagram.com', 'netflix.com', 'twitch.tv', 'facebook.com', 'twitter.com', 'x.com']
    }, (response) => {
      console.log('[SleepGuard Content Script] Background response:', response);
    });
  }
});

// Announce presence on load
window.postMessage({ source: 'SLEEPGUARD_EXTENSION', type: 'SLEEPGUARD_PONG' }, '*');
