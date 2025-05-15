declare namespace chrome.declarativeNetRequest {
  interface Rule {
    id: number;
    priority: number;
    action: {
      type: chrome.declarativeNetRequest.RuleActionType;
      redirect?: chrome.declarativeNetRequest.Redirect;
      requestHeaders?: chrome.declarativeNetRequest.ModifyHeaderInfo[];
      responseHeaders?: chrome.declarativeNetRequest.ModifyHeaderInfo[];
    };
    condition: {
      urlFilter?: string;
      regexFilter?: string;
      isUrlFilterCaseSensitive?: boolean;
      initiatorDomains?: string[];
      excludedInitiatorDomains?: string[];
      requestDomains?: string[];
      excludedRequestDomains?: string[];
      resourceTypes?: chrome.declarativeNetRequest.ResourceType[];
      excludedResourceTypes?: chrome.declarativeNetRequest.ResourceType[];
      domains?: string[];
      excludedDomains?: string[];
      tabIds?: number[];
      excludedTabIds?: number[];
    };
  }

  interface RuleActionType {
    BLOCK: 'block';
    REDIRECT: 'redirect';
    ALLOW: 'allow';
    UPGRADE_SCHEME: 'upgradeScheme';
    MODIFY_HEADERS: 'modifyHeaders';
    ALLOW_ALL_REQUESTS: 'allowAllRequests';
  }
}

// Extend storage interface with our custom data types
declare namespace chrome.storage {
  interface StorageArea {
    get(keys: string | string[] | null | { [key: string]: any }): Promise<{ [key: string]: any }>;
    set(items: { [key: string]: any }): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
  }
}

// Custom interfaces for our extension
interface FilterStats {
  totalBlockedRequests: number;
  totalTrackers: number;
  domainStats: Record<string, number>;
}

interface ExtensionSettings {
  enabled: boolean;
  blockAds: boolean;
  blockTrackers: boolean;
  blockMalware: boolean;
  customFilterLists: string[];
  stats: FilterStats;
  lastUpdated: string;
}