import { WebExtensionBlocker } from '@cliqz/adblocker-webextension';
import { fetch } from 'cross-fetch';

// Type definitions for custom rule format
interface FilterRule {
  id: number;
  priority: number;
  action: {
    type: chrome.declarativeNetRequest.RuleActionType;
  };
  condition: {
    urlFilter: string;
    resourceTypes: chrome.declarativeNetRequest.ResourceType[];
    domains?: string[];
    excludedDomains?: string[];
  };
}

interface FilterStats {
  totalBlockedRequests: number;
  totalTrackers: number;
  totalPopups: number;
  domainStats: Record<string, number>;
}

// List of known ad/tracking domains for popup detection
const AD_DOMAINS = [
  // User reported domains - highest priority
  'tzegilo.com', 'goggletagmanager.com', 'paupsoborofoow.net', 'wasm',
  // Common popup domains
  'popads.net', 'popunder.net', 'popcash.net', 'propellerads.com',
  'adcash.com', 'exosrv.com', 'clickadu.com', 'aclickads.com',
  'doubleclick.net', 'googlesyndication.com', 'adservice.google.com',
  'advertising.com', 'taboola.com', 'outbrain.com', 'revcontent.com',
  'mgid.com', 'adsterra.com', 'hilltopads.net'
];

// Content script to inject for blocking popups and redirects
const POPUP_BLOCKER_SCRIPT = `
// Override window.open
const originalWindowOpen = window.open;
window.open = function(...args) {
  console.log('[AdBlocker Pro] Blocked popup:', args[0]);
  return null;
};

// Override location methods
const originalAssign = window.location.assign;
window.location.assign = function(url) {
  if (url.includes('ad') || url.includes('click') || url.includes('track') || 
      url.includes('redirect') || url.includes('pop')) {
    console.log('[AdBlocker Pro] Blocked redirect to:', url);
    return;
  }
  return originalAssign.apply(this, arguments);
};

const originalReplace = window.location.replace;
window.location.replace = function(url) {
  if (url.includes('ad') || url.includes('click') || url.includes('track') || 
      url.includes('redirect') || url.includes('pop')) {
    console.log('[AdBlocker Pro] Blocked redirect replace to:', url);
    return;
  }
  return originalReplace.apply(this, arguments);
};

// Block setting location.href
let nextHref = '';
Object.defineProperty(window.location, 'href', {
  get: function() { 
    return window.location.toString();
  },
  set: function(url) {
    if (url.includes('ad') || url.includes('click') || url.includes('track') || 
        url.includes('redirect') || url.includes('pop')) {
      console.log('[AdBlocker Pro] Blocked setting location.href to:', url);
      return;
    }
    nextHref = url;
    originalAssign.call(this, url);
  }
});

// Block setTimeout redirects
const originalSetTimeout = window.setTimeout;
window.setTimeout = function(fn, delay, ...args) {
  if (typeof fn === 'string') {
    if (fn.includes('location') || fn.includes('window.open') ||
        fn.includes('redirect') || fn.includes('popup')) {
      console.log('[AdBlocker Pro] Blocked setTimeout redirect code');
      return 0;
    }
  } else if (typeof fn === 'function') {
    const fnStr = fn.toString();
    if (fnStr.includes('location') || fnStr.includes('window.open') ||
        fnStr.includes('redirect') || fnStr.includes('popup')) {
      console.log('[AdBlocker Pro] Blocked setTimeout redirect function');
      return 0;
    }
  }
  return originalSetTimeout(fn, delay, ...args);
};

// Block setInterval redirects
const originalSetInterval = window.setInterval;
window.setInterval = function(fn, delay, ...args) {
  if (typeof fn === 'string') {
    if (fn.includes('location') || fn.includes('window.open') ||
        fn.includes('redirect') || fn.includes('popup')) {
      console.log('[AdBlocker Pro] Blocked setInterval redirect code');
      return 0;
    }
  } else if (typeof fn === 'function') {
    const fnStr = fn.toString();
    if (fnStr.includes('location') || fnStr.includes('window.open') ||
        fnStr.includes('redirect') || fnStr.includes('popup')) {
      console.log('[AdBlocker Pro] Blocked setInterval redirect function');
      return 0;
    }
  }
  return originalSetInterval(fn, delay, ...args);
};

// Remove existing popups
function removePopups() {
  const selectors = [
    'div[class*="popup"]',
    'div[id*="popup"]',
    'div[class*="modal"]',
    'div[id*="modal"]',
    'div[class*="overlay"]',
    'div[id*="overlay"]',
    'iframe[src*="ad"]',
    'iframe[src*="click"]',
    'iframe[src*="track"]',
    'iframe[src*="banner"]'
  ];
  
  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      console.log('[AdBlocker Pro] Removing popup element:', el);
      el.remove();
    });
  });
}

// Run immediately
removePopups();

// Run periodically
setInterval(removePopups, 1000);

// Monitor DOM for changes to catch dynamically added popups
const observer = new MutationObserver(mutations => {
  let shouldRemove = false;
  
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.addedNodes.length) {
      shouldRemove = true;
      break;
    }
  }
  
  if (shouldRemove) {
    removePopups();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Block third-party iframe navigation
try {
  if (window !== window.top) {
    const currentUrl = window.location.href;
    // If it's a third-party iframe with ad-related URL, block it
    if (currentUrl.includes('ad') || currentUrl.includes('track') ||
        currentUrl.includes('click') || currentUrl.includes('popup')) {
      document.body.textContent = '';
      document.head.textContent = '';
      window.stop();
      console.log('[AdBlocker Pro] Blocked third-party iframe:', currentUrl);
    }
  }
} catch (e) {
  // Cross-origin access errors are expected
}
`;

// Initialize storage with default values
const initializeStorage = async (): Promise<void> => {
  const defaultSettings = {
    enabled: true,
    blockAds: true,
    blockTrackers: true,
    blockMalware: true,
    blockPopups: true,
    customFilterLists: [],
    stats: {
      totalBlockedRequests: 0,
      totalTrackers: 0,
      totalPopups: 0,
      domainStats: {}
    } as FilterStats,
    lastUpdated: new Date().toISOString()
  };

  await chrome.storage.local.set(defaultSettings);
};

// Initialize the blocker engine
const initializeBlocker = async (): Promise<WebExtensionBlocker> => {
  console.log('Initializing ad blocker engine...');
  
  // Create blocker with default lists
  const blocker = await WebExtensionBlocker.fromPrebuiltAdsAndTracking(fetch);
  
  // Enable the blocker
  await blocker.enableBlockingInBrowser(chrome);
  
  console.log('Ad blocker engine initialized successfully');
  return blocker;
};

// Load and apply custom rules
const loadCustomRules = async (): Promise<void> => {
  try {
    console.log('Loading custom declarativeNetRequest rules...');
    const response = await fetch(chrome.runtime.getURL('rules.json'));
    // rules.json now contains a direct array of rules
    const rules: FilterRule[] = await response.json();
    
    console.log(`Found ${rules.length} rules in rules.json`);
    
    // Convert custom rules to Chrome's declarativeNetRequest format
    const chromeRules: chrome.declarativeNetRequest.Rule[] = rules.map(rule => ({
      id: rule.id,
      priority: rule.priority,
      action: { type: rule.action.type },
      condition: {
        urlFilter: rule.condition.urlFilter,
        resourceTypes: rule.condition.resourceTypes,
        domains: rule.condition.domains,
        excludedDomains: rule.condition.excludedDomains
      }
    }));
    
    // Get current rules to remove them
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const currentRuleIds = currentRules.map(rule => rule.id);
    
    // Update dynamic rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: chromeRules.slice(0, MAX_NUMBER_OF_DYNAMIC_RULES)
    });
    
    console.log(`Loaded and applied ${chromeRules.length} custom rules`);
    
    // Update last updated timestamp
    await chrome.storage.local.set({ lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('Error loading custom rules:', error);
  }
};

// Maximum number of dynamic rules Chrome allows
const MAX_NUMBER_OF_DYNAMIC_RULES = 5000;

// Track recently created tabs to detect popups
const recentTabs: Map<number, { timestamp: number, opener?: number, url: string }> = new Map();

// Detect and handle popup tabs
const handleTabCreated = async (tab: chrome.tabs.Tab): Promise<void> => {
  // Skip tabs without URLs
  if (!tab.url || tab.url === '') return;
  
  const { blockPopups } = await chrome.storage.local.get('blockPopups');
  
  // Skip if popup blocking is disabled
  if (blockPopups === false) return;
  
  const tabId = tab.id as number;
  const url = new URL(tab.url);
  
  // Check for ad domains
  const isAdDomain = AD_DOMAINS.some(domain => 
    url.hostname.includes(domain) || url.href.includes(domain)
  );
  
  // Check for ad-related URLs
  const isAdUrl = 
    url.href.includes('ad') || 
    url.href.includes('pop') || 
    url.href.includes('click') || 
    url.href.includes('track') || 
    url.href.includes('redirect');
  
  // If created by a script or is an ad domain/URL, possibly a popup
  if ((tab.openerTabId && (isAdDomain || isAdUrl)) || 
      (isAdDomain) || 
      (url.hostname === 'tzegilo.com' || url.hostname.includes('goggletagmanager') || url.hostname.includes('paupsoborofoow'))) {
    console.log(`Detected potential popup: ${tab.url}`);
    
    // Update popup stats
    const { stats } = await chrome.storage.local.get('stats');
    const currentStats: FilterStats = stats || {
      totalBlockedRequests: 0,
      totalTrackers: 0,
      totalPopups: 0,
      domainStats: {}
    };
    
    currentStats.totalPopups += 1;
    await chrome.storage.local.set({ stats: currentStats });
    
    // Close the popup tab immediately
    chrome.tabs.remove(tabId).catch(err => 
      console.log(`Failed to close popup tab ${tabId}: ${err}`)
    );
    
    return; // No need to track this tab since we're closing it
  }
  
  // Track this tab for future reference
  recentTabs.set(tabId, { 
    timestamp: Date.now(),
    opener: tab.openerTabId,
    url: tab.url
  });
  
  // Clean up old entries
  const now = Date.now();
  for (const [id, data] of recentTabs.entries()) {
    if (now - data.timestamp > 30000) {
      recentTabs.delete(id);
    }
  }
};

// Update statistics when a request is blocked using declarativeNetRequest
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(
  (info) => {
    // Update stats regardless of rule type since all our rules are blocking
    chrome.storage.local.get('stats', (data) => {
      const currentStats: FilterStats = data.stats || {
        totalBlockedRequests: 0,
        totalTrackers: 0,
        totalPopups: 0,
        domainStats: {}
      };
      
      // Extract domain from URL
      const url = new URL(info.request.url);
      
      // Update statistics
      currentStats.totalBlockedRequests += 1;
      
      // Check if it's a tracker
      const knownTrackers = [
        'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
        'doubleclick.net', 'googleadservices.com', 'google-analytics.com',
        'facebook.net', 'facebook.com', 'connect.facebook.net',
        'x.com', 'twimg.com', 't.co', 'linkedin.com', 'licdn.com',
        'adnxs.com', 'adform.net', 'adroll.com', 'criteo.com', 
        'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com',
        'hotjar.com', 'mixpanel.com', 'segment.io', 
        'optimizely.com', 'newrelic.com', 'pingdom.net'
      ];
      
      const isTracker = knownTrackers.some(tracker => {
        const domain = url.hostname.toLowerCase();
        return domain.includes(tracker) || domain.endsWith(`.${tracker}`);
      });
      
      if (isTracker) {
        currentStats.totalTrackers += 1;
      }
      
      // Check if it's a popup (based on resource type or URL)
      if (
        info.request.type === "main_frame" && 
        (info.request.url.includes("popup") || 
        info.request.url.includes("click") || 
        info.request.url.includes("redirect"))
      ) {
        currentStats.totalPopups += 1;
      }
      
      // Update domain-specific stats
      if (!currentStats.domainStats[url.hostname]) {
        currentStats.domainStats[url.hostname] = 0;
      }
      currentStats.domainStats[url.hostname] += 1;
      
      // Save updated stats
      chrome.storage.local.set({ stats: currentStats });
    });
  }
);

// Inject content script to block popup-generating scripts
const injectAntiPopupScript = async (tabId: number, frameId: number): Promise<void> => {
  const { blockPopups, enabled } = await chrome.storage.local.get(['blockPopups', 'enabled']);
  
  // Skip if popup blocking is disabled or extension is disabled
  if (blockPopups === false || enabled === false) return;
  
  try {
    // Get the tab info to check the URL
    const tab = await chrome.tabs.get(tabId);
    
    // Skip restricted URLs: chrome://, about:, extension:, etc.
    if (tab.url && (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('brave://') ||
        tab.url.startsWith('opera://') ||
        tab.url.startsWith('vivaldi://') ||
        tab.url.startsWith('devtools://') ||
        tab.url.startsWith('file:///')
    )) {
      console.log(`Skipping injection for restricted URL: ${tab.url}`);
      return;
    }
    
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: () => {
        // Script gets injected from POPUP_BLOCKER_SCRIPT string via Function constructor
        new Function(POPUP_BLOCKER_SCRIPT)();
      }
    });
    console.log(`Injected anti-popup script into tab ${tabId}, frame ${frameId}`);
  } catch (error) {
    // Ignore "Frame was removed" errors as they're expected when blocking popups
    if (error instanceof Error && 
        error.message.includes("Frame") && 
        error.message.includes("removed")) {
      // This is normal when blocking popups - frames get removed
      return;
    }
    console.error(`Failed to inject anti-popup script: ${error}`);
  }
};

// Listen for installation or update events
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await initializeStorage();
    console.log('AdBlocker Pro has been installed and initialized');
  } else if (details.reason === 'update') {
    console.log(`AdBlocker Pro updated from ${details.previousVersion} to ${chrome.runtime.getManifest().version}`);
  }
  
  // Initialize blocker and load rules
  const blocker = await initializeBlocker();
  await loadCustomRules();
  
  // Set up declarative rules for popups and ads
  await setupDeclarativeRules();
  
  // Set up badge
  chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
  chrome.action.setBadgeText({ text: 'ON' });
});

// Listen for tab creation to detect and block popups
chrome.tabs.onCreated.addListener(handleTabCreated);

// Listen for navigation events to inject anti-popup scripts
chrome.webNavigation.onCommitted.addListener(async (details) => {
  try {
    await injectAntiPopupScript(details.tabId, details.frameId);
  } catch (error) {
    console.log(`Error injecting script on navigation: ${error}`);
  }
});

// Inject anti-popup script when DOM is loaded
chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  try {
    await injectAntiPopupScript(details.tabId, details.frameId);
  } catch (error) {
    console.log(`Error injecting script on DOM load: ${error}`);
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.enabled) {
    const enabled = changes.enabled.newValue;
    
    if (enabled) {
      // Re-enable the blocker
      const blocker = await initializeBlocker();
      await loadCustomRules();
      chrome.action.setBadgeText({ text: 'ON' });
    } else {
      // Disable the blocker
      const blocker = await initializeBlocker();
      await blocker.disableBlockingInBrowser(chrome);
      chrome.action.setBadgeText({ text: 'OFF' });
    }
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getStats') {
    chrome.storage.local.get('stats', (data) => {
      sendResponse(data.stats || {
        totalBlockedRequests: 0,
        totalTrackers: 0,
        totalPopups: 0,
        domainStats: {}
      });
    });
    return true; // Keep the message channel open for the async response
  }
  
  if (message.action === 'resetStats') {
    chrome.storage.local.set({
      stats: {
        totalBlockedRequests: 0,
        totalTrackers: 0,
        totalPopups: 0,
        domainStats: {}
      }
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'updateFilters') {
    loadCustomRules().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error updating filters:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Intercept requests that might be popups or redirects
// Using declarativeNetRequest instead of blocking webRequest
const setupDeclarativeRules = async (): Promise<void> => {
  try {
    // Create dynamic rules to block popup and ad domains
    const popupRules: chrome.declarativeNetRequest.Rule[] = [];
    
    // Add rules for specific domains from AD_DOMAINS
    AD_DOMAINS.forEach((domain, index) => {
      // Create rule with proper type casting
      const rule: chrome.declarativeNetRequest.Rule = {
        id: 100000 + index, // Use high IDs to avoid conflicts
        priority: 100,
        action: { type: "block" as unknown as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          urlFilter: `*${domain}*`,
          resourceTypes: [
            "main_frame", "sub_frame", "script", "image", "stylesheet", 
            "object", "xmlhttprequest", "ping", "media", "websocket"
          ] as chrome.declarativeNetRequest.ResourceType[]
        }
      };
      popupRules.push(rule);
    });
    
    // Add rules for common popup patterns
    const popupPatterns = ["popup", "popunder", "pop.js", "pop_", "click", "redirect", "/rd/", "track"];
    popupPatterns.forEach((pattern, index) => {
      // Create rule with proper type casting
      const rule: chrome.declarativeNetRequest.Rule = {
        id: 200000 + index,
        priority: 90,
        action: { type: "block" as unknown as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          urlFilter: `*${pattern}*`,
          resourceTypes: [
            "main_frame", "sub_frame", "script"
          ] as chrome.declarativeNetRequest.ResourceType[]
        }
      };
      popupRules.push(rule);
    });
    
    // Get existing rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    // Update the dynamic rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: popupRules
    });
    
    console.log(`Added ${popupRules.length} declarative blocking rules`);
  } catch (error) {
    console.error("Error setting up declarative rules:", error);
  }
};
