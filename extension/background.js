/* ==========================================================================
   SleepGuard Pro Extension — Background Service Worker (Manifest V3)
   Handles Selective Closure of Protected Tabs & Self-Close (SleepGuard Tab)
   ========================================================================== */

const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/CyberDrivePro/SleepGuard-AI-Browser-Protector/main/version.json';
const CURRENT_VERSION = '11.0.0';

// =====================================================================
// CORE: Proper hostname matcher (exact + subdomain, no false positives)
// =====================================================================
function hostnameMatchesDomain(hostname, domain) {
  if (!hostname || !domain) return false;
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return h === d || h.endsWith('.' + d);
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

// =====================================================================
// MAIN MESSAGE HANDLER (Manifest V3 Async Pattern)
// =====================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SleepGuard BG] Command received:', message.type || message.action, message);

  if (message.type === 'SLEEPGUARD_CLOSE_ACTION' || message.action === 'CLOSE_PROTECTED_TABS') {
    handleCloseAction(message, sender).then((res) => sendResponse(res)).catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  } else if (message.type === 'SLEEPGUARD_CLOSE_DRY_RUN') {
    handleDryRun(message, sender).then((res) => sendResponse(res)).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'CHECK_EXTENSION_ALIVE') {
    sendResponse({ alive: true, version: CURRENT_VERSION });
    return true;
  } else if (message.type === 'CHECK_UPDATES') {
    checkForExtensionUpdates().then(updateInfo => sendResponse(updateInfo));
    return true;
  }
});

async function handleCloseAction(message, sender) {
  const protectedDomains = Array.isArray(message.protectedDomains) ? message.protectedDomains : [];
  const protectAllOtherTabs = message.protectAllOtherTabs === true;
  const closeSleepGuardPage = message.closeSleepGuardPage === true;
  const selfCloseDelaySecs = typeof message.selfCloseDelaySecs === 'number' ? message.selfCloseDelaySecs : 2;
  const actionScope = message.actionScope || 'protected';
  const callerUrl = (message.callerUrl || '').toLowerCase();

  console.log('[SleepGuard BG] handleCloseAction params:', { protectedDomains, protectAllOtherTabs, closeSleepGuardPage, selfCloseDelaySecs, actionScope, callerUrl });

  // Helper to check if a tab is the SleepGuard monitoring app
  function isSleepGuardTab(tab) {
    if (!tab || !tab.url) return false;
    const urlLower = tab.url.toLowerCase();
    if (sender.tab && tab.id === sender.tab.id) return true;
    if (callerUrl && (urlLower === callerUrl || urlLower.startsWith(callerUrl))) return true;
    if (urlLower.includes('sleepguard') || urlLower.includes('cyberdrivepro.github.io')) return true;
    const titleLower = (tab.title || '').toLowerCase();
    if (titleLower.includes('sleepguard')) return true;
    return false;
  }

  // Close entire window if requested
  if (actionScope === 'window' && sender.tab && sender.tab.windowId) {
    console.log('[SleepGuard BG] Closing entire window:', sender.tab.windowId);
    try {
      await chrome.windows.remove(sender.tab.windowId);
      return { success: true, closed: 'window' };
    } catch (e) {
      console.warn('[SleepGuard BG] Error closing window:', e);
    }
  }

  const tabs = await chrome.tabs.query({});
  console.log(`[SleepGuard BG] Total open tabs queried: ${tabs.length}`);

  let sleepGuardTabId = sender.tab ? sender.tab.id : null;
  if (!sleepGuardTabId) {
    const found = tabs.find(t => isSleepGuardTab(t));
    if (found) sleepGuardTabId = found.id;
  }

  const toClose = [];
  const report = { closing: [], skipped: [] };

  tabs.forEach((tab) => {
    // ALWAYS exclude SleepGuard monitoring tab from regular close batch!
    if (tab.id === sleepGuardTabId || isSleepGuardTab(tab)) {
      console.log(`[SleepGuard BG] EXCLUDING SleepGuard tab: ${tab.title} (${tab.id})`);
      report.skipped.push(`${tab.title || 'SleepGuard Page'} (SleepGuard App — Excluded from regular close)`);
      return;
    }

    const url = tab.url || '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      report.skipped.push(`${tab.title || 'Browser Page'} (Internal page)`);
      return;
    }

    const hostname = getHostname(url);
    if (!hostname) return;

    const matchedDomain = protectedDomains.find(d => hostnameMatchesDomain(hostname, d));
    const isProtectedDomain = !!matchedDomain;

    let shouldClose = false;

    if (actionScope === 'protected') {
      if (isProtectedDomain) {
        shouldClose = true;
      } else if (protectAllOtherTabs) {
        shouldClose = true;
      }
    } else if (actionScope === 'all_others') {
      shouldClose = true;
    }

    if (shouldClose) {
      console.log(`[SleepGuard BG] TARGET TO CLOSE: ${tab.title} (${hostname}) [ID: ${tab.id}]`);
      toClose.push(tab.id);
      report.closing.push(`${tab.title || hostname} (${hostname})`);
    } else {
      console.log(`[SleepGuard BG] KEEP OPEN: ${tab.title} (${hostname})`);
      report.skipped.push(`${tab.title || hostname} (${hostname})`);
    }
  });

  // Safely close target tabs one by one
  let closedCount = 0;
  for (const tabId of toClose) {
    try {
      await chrome.tabs.remove(tabId);
      closedCount++;
      console.log(`[SleepGuard BG] Successfully removed tab ID: ${tabId}`);
    } catch (err) {
      console.warn(`[SleepGuard BG] Failed removing tab ID ${tabId}:`, err);
    }
  }

  // Notify web app
  if (sleepGuardTabId) {
    try {
      await chrome.tabs.sendMessage(sleepGuardTabId, {
        type: 'SLEEPGUARD_TABS_CLOSED',
        closedCount: closedCount,
        report: report
      });
    } catch (e) {
      console.warn('[SleepGuard BG] Could not notify web app tab:', e);
    }
  }

  // Execute self-close sequence AFTER delay
  if (closeSleepGuardPage && sleepGuardTabId) {
    const delayMs = selfCloseDelaySecs * 1000;
    console.log(`[SleepGuard BG] Self-Protection: Waiting ${selfCloseDelaySecs}s before closing SleepGuard tab (${sleepGuardTabId})...`);
    setTimeout(async () => {
      try {
        await chrome.tabs.remove(sleepGuardTabId);
        console.log('[SleepGuard BG] SleepGuard monitoring tab closed. Sequence complete.');
      } catch (e) {
        console.warn('[SleepGuard BG] Error closing SleepGuard tab:', e);
      }
    }, delayMs);
  }

  return { success: true, closedTabsCount: closedCount, report: report };
}

async function handleDryRun(message, sender) {
  const protectedDomains = Array.isArray(message.protectedDomains) ? message.protectedDomains : [];
  const protectAllOtherTabs = message.protectAllOtherTabs === true;
  const sleepGuardTabId = sender.tab ? sender.tab.id : null;

  const tabs = await chrome.tabs.query({});
  const wouldClose = [];
  const wouldKeep = [];

  tabs.forEach((tab) => {
    if (tab.id === sleepGuardTabId) return;
    const url = tab.url || '';
    if (!url.startsWith('http')) return;
    const hostname = getHostname(url);
    if (!hostname) return;

    const isProtected = protectedDomains.some(d => hostnameMatchesDomain(hostname, d));
    const shouldClose = isProtected || protectAllOtherTabs;

    if (shouldClose) {
      wouldClose.push({ title: tab.title || hostname, hostname, matched: isProtected ? protectedDomains.find(d => hostnameMatchesDomain(hostname, d)) : 'All Other Tabs' });
    } else {
      wouldKeep.push({ title: tab.title || hostname, hostname });
    }
  });

  return { success: true, wouldClose, wouldKeep };
}

async function checkForExtensionUpdates() {
  try {
    const res = await fetch(VERSION_CHECK_URL);
    if (!res.ok) return { updateAvailable: false };
    const data = await res.json();
    if (data && data.version && data.version > CURRENT_VERSION) {
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

chrome.alarms.create('checkVersionAlarm', { periodInMinutes: 720 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkVersionAlarm') checkForExtensionUpdates();
});
