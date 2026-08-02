/* ==========================================================================
   SleepGuard Pro Extension — Background Service Worker (Manifest V3)
   Handles Selective Closure of Protected Tabs & Version Check
   ========================================================================== */

const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/CyberDrivePro/SleepGuard-AI-Browser-Protector/main/version.json';
const CURRENT_VERSION = '11.0.0';

// Listen for messages from web app content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SleepGuard Extension BG] Received action:', message);

  if (message.type === 'SLEEPGUARD_CLOSE_ACTION' || message.action === 'CLOSE_PROTECTED_TABS') {
    const protectedDomains = message.protectedDomains || ['youtube.com', 'instagram.com', 'netflix.com', 'twitch.tv', 'facebook.com', 'twitter.com', 'x.com'];
    const actionScope = message.actionScope || 'protected';

    if (actionScope === 'window' && sender.tab && sender.tab.windowId) {
      console.log('[SleepGuard Extension BG] Closing entire window...');
      chrome.windows.remove(sender.tab.windowId, () => sendResponse({ success: true, closed: 'window' }));
      return true;
    }

    // Query all browser tabs
    chrome.tabs.query({}, (tabs) => {
      let closedCount = 0;
      tabs.forEach((tab) => {
        // Do NOT close the SleepGuard AI monitoring tab itself!
        if (sender.tab && tab.id === sender.tab.id) return;

        const tabUrl = (tab.url || '').toLowerCase();
        
        // Check if tab URL matches any protected domain
        const isProtected = protectedDomains.some(domain => tabUrl.includes(domain.toLowerCase()));

        if (actionScope === 'protected' && isProtected) {
          console.log(`[SleepGuard Extension BG] Closing Protected Tab: ${tab.title} (${tab.url})`);
          chrome.tabs.remove(tab.id);
          closedCount++;
        } else if (actionScope === 'all_others') {
          console.log(`[SleepGuard Extension BG] Closing Other Tab: ${tab.title}`);
          chrome.tabs.remove(tab.id);
          closedCount++;
        }
      });

      sendResponse({ success: true, closedTabsCount: closedCount });
    });
    return true;
  } else if (message.type === 'CHECK_EXTENSION_ALIVE') {
    sendResponse({ alive: true, version: CURRENT_VERSION });
    return true;
  } else if (message.type === 'CHECK_UPDATES') {
    checkForExtensionUpdates().then(updateInfo => sendResponse(updateInfo));
    return true;
  }
});

// Auto Check for Extension Updates
async function checkForExtensionUpdates() {
  try {
    const res = await fetch(VERSION_CHECK_URL);
    if (!res.ok) return { updateAvailable: false };
    const data = await res.json();
    
    if (data && data.version && data.version > CURRENT_VERSION) {
      console.log(`[SleepGuard Extension] New version available: ${data.version} (Current: ${CURRENT_VERSION})`);
      return {
        updateAvailable: true,
        latestVersion: data.version,
        downloadUrl: data.downloadUrl || 'https://github.com/CyberDrivePro/SleepGuard-AI-Browser-Protector/releases/latest',
        releaseNotes: data.releaseNotes || ''
      };
    }
  } catch (e) {
    console.warn('[SleepGuard Extension] Version check failed:', e);
  }
  return { updateAvailable: false, currentVersion: CURRENT_VERSION };
}

// Periodically check for updates every 12 hours
chrome.alarms.create('checkVersionAlarm', { periodInMinutes: 720 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkVersionAlarm') {
    checkForExtensionUpdates();
  }
});
