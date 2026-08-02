/* ==========================================================================
   SleepGuard AI Extension — Background Service Worker (Manifest V3)
   ========================================================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SleepGuard Extension BG] Received message:', message);

  if (message.type === 'SLEEPGUARD_CLOSE_ACTION') {
    const action = message.action || 'tab';
    
    if (action === 'window' && sender.tab && sender.tab.windowId) {
      console.log('[SleepGuard Extension BG] Closing entire browser window:', sender.tab.windowId);
      chrome.windows.remove(sender.tab.windowId, () => {
        sendResponse({ success: true, closed: 'window' });
      });
      return true;
    } else if (sender.tab && sender.tab.id) {
      console.log('[SleepGuard Extension BG] Closing active tab:', sender.tab.id);
      chrome.tabs.remove(sender.tab.id, () => {
        sendResponse({ success: true, closed: 'tab' });
      });
      return true;
    }
  } else if (message.type === 'CHECK_EXTENSION_ALIVE') {
    sendResponse({ alive: true, version: '1.0.0' });
    return true;
  }
});
