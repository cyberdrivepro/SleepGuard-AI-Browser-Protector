/* ==========================================================================
   SleepGuard Pro Extension — Background Service Worker (Manifest V3)
   Proper domain-match engine: exact hostname + subdomain matching
   ========================================================================== */

const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/CyberDrivePro/SleepGuard-AI-Browser-Protector/main/version.json';
const CURRENT_VERSION = '11.0.0';

// =====================================================================
// CORE: Proper hostname matcher (exact + subdomain, no false positives)
// =====================================================================
function hostnameMatchesDomain(hostname, domain) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '');
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
// MAIN MESSAGE HANDLER
// =====================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SleepGuard BG] Received:', message.type, message);

  if (message.type === 'SLEEPGUARD_CLOSE_ACTION' || message.action === 'CLOSE_PROTECTED_TABS') {

    const protectedDomains = Array.isArray(message.protectedDomains) ? message.protectedDomains : [];
    const protectAllOtherTabs = message.protectAllOtherTabs === true;
    const closeSleepGuardPage = message.closeSleepGuardPage === true;
    const actionScope = message.actionScope || 'protected';

    // --- Close entire browser window ---
    if (actionScope === 'window' && sender.tab && sender.tab.windowId) {
      console.log('[SleepGuard BG] Closing entire window:', sender.tab.windowId);
      chrome.windows.remove(sender.tab.windowId, () => sendResponse({ success: true, closed: 'window' }));
      return true;
    }

    chrome.tabs.query({}, (tabs) => {
      const sleepGuardTabId = sender.tab ? sender.tab.id : null;
      const sleepGuardHostname = sender.tab ? getHostname(sender.tab.url || '') : '';

      const toClose = [];
      const report = { closing: [], skipped: [] };

      tabs.forEach((tab) => {
        // Never close SleepGuard tab itself here (handled separately below)
        if (tab.id === sleepGuardTabId) return;

        const url = tab.url || '';
        // Skip browser internal pages (chrome://, about:, etc.)
        if (!url.startsWith('http://') && !url.startsWith('https://')) return;

        const hostname = getHostname(url);
        if (!hostname) return;

        // Check if this tab matches any protected domain
        const matchedDomain = protectedDomains.find(d => hostnameMatchesDomain(hostname, d));
        const isProtectedDomain = !!matchedDomain;

        let shouldClose = false;

        if (actionScope === 'protected') {
          if (isProtectedDomain) {
            // ✅ Domain is in protected list → CLOSE
            shouldClose = true;
          } else if (protectAllOtherTabs) {
            // ✅ "All Other Tabs" is ON → close anything NOT in protected list
            // But only close if not already a protected-domain match (double-check)
            shouldClose = true;
          }
          // ❌ Domain not in list AND All Other Tabs is OFF → KEEP OPEN
        } else if (actionScope === 'all_others') {
          shouldClose = true;
        }

        if (shouldClose) {
          console.log(`[SleepGuard BG] CLOSING: ${tab.title} (${hostname})`);
          toClose.push(tab.id);
          report.closing.push(`${tab.title || hostname} (${hostname})`);
        } else {
          console.log(`[SleepGuard BG] KEEPING: ${tab.title} (${hostname})`);
          report.skipped.push(`${tab.title || hostname} (${hostname})`);
        }
      });

      const doSelfClose = () => {
        if (closeSleepGuardPage && sleepGuardTabId) {
          console.log('[SleepGuard BG] Self-Protection: Closing SleepGuard tab last...');
          setTimeout(() => {
            chrome.tabs.remove(sleepGuardTabId, () => {
              console.log('[SleepGuard BG] SleepGuard tab closed. Protection complete.');
            });
          }, 800);
        }
      };

      const notifyWebApp = (closedCount) => {
        if (sleepGuardTabId) {
          chrome.tabs.sendMessage(sleepGuardTabId, {
            type: 'SLEEPGUARD_TABS_CLOSED',
            closedCount: closedCount,
            report: report
          }).catch(() => {});
        }
      };

      if (toClose.length > 0) {
        chrome.tabs.remove(toClose, () => {
          console.log(`[SleepGuard BG] Closed ${toClose.length} tab(s).`);
          notifyWebApp(toClose.length);
          doSelfClose();
          sendResponse({ success: true, closedTabsCount: toClose.length, report: report });
        });
      } else {
        console.log('[SleepGuard BG] No matching protected tabs found.');
        notifyWebApp(0);
        doSelfClose();
        sendResponse({ success: true, closedTabsCount: 0, report: report });
      }
    });

    return true; // Keep message channel open for async sendResponse

  } else if (message.type === 'SLEEPGUARD_CLOSE_DRY_RUN') {
    // === DRY RUN: Preview which tabs would be closed without actually closing ===
    const protectedDomains = Array.isArray(message.protectedDomains) ? message.protectedDomains : [];
    const protectAllOtherTabs = message.protectAllOtherTabs === true;
    const sleepGuardTabId = sender.tab ? sender.tab.id : null;

    chrome.tabs.query({}, (tabs) => {
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

      sendResponse({ success: true, wouldClose, wouldKeep });
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

// =====================================================================
// VERSION CHECK
// =====================================================================
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
