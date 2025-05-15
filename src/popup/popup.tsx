import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';

interface PopupState {
  enabled: boolean;
  blockAds: boolean;
  blockTrackers: boolean;
  blockMalware: boolean;
  blockPopups: boolean;
  stats: {
    totalBlockedRequests: number;
    totalTrackers: number;
    totalPopups: number;
    domainStats: Record<string, number>;
  };
  activeTab: 'dashboard' | 'settings' | 'stats';
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    enabled: true,
    blockAds: true,
    blockTrackers: true,
    blockMalware: true,
    blockPopups: true,
    stats: {
      totalBlockedRequests: 0,
      totalTrackers: 0,
      totalPopups: 0,
      domainStats: {}
    },
    activeTab: 'dashboard'
  });

  useEffect(() => {
    // Load settings from storage
    chrome.storage.local.get(null, (data) => {
      setState(prevState => ({
        ...prevState,
        enabled: data.enabled ?? true,
        blockAds: data.blockAds ?? true,
        blockTrackers: data.blockTrackers ?? true,
        blockMalware: data.blockMalware ?? true,
        blockPopups: data.blockPopups ?? true
      }));
    });

    // Load stats
    loadStats();
  }, []);

  const loadStats = () => {
    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
      setState(prevState => ({
        ...prevState,
        stats: response
      }));
    });
  };

  const toggleExtension = () => {
    const newEnabled = !state.enabled;
    chrome.storage.local.set({ enabled: newEnabled });
    setState(prevState => ({ ...prevState, enabled: newEnabled }));
  };

  const toggleSetting = (setting: 'blockAds' | 'blockTrackers' | 'blockMalware' | 'blockPopups') => {
    const newValue = !state[setting];
    chrome.storage.local.set({ [setting]: newValue });
    setState(prevState => ({ ...prevState, [setting]: newValue }));
  };

  const resetStats = () => {
    chrome.runtime.sendMessage({ action: 'resetStats' }, () => {
      loadStats();
    });
  };

  const updateFilters = () => {
    chrome.runtime.sendMessage({ action: 'updateFilters' }, (response) => {
      if (response && response.success) {
        // Show notification or feedback
        alert('Filters updated successfully');
      } else {
        alert('Error updating filters. Please try again.');
      }
    });
  };

  const switchTab = (tab: 'dashboard' | 'settings' | 'stats') => {
    setState(prevState => ({ ...prevState, activeTab: tab }));
  };

  const getTopDomains = (): Array<[string, number]> => {
    return Object.entries(state.stats.domainStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  };

  return (
    <div>
      <div className="header">
        <h1>AdBlocker Pro</h1>
      </div>

      <div className="tabs">
        <div 
          className={`tab ${state.activeTab === 'dashboard' ? 'active' : ''}`} 
          onClick={() => switchTab('dashboard')}
        >
          Dashboard
        </div>
        <div 
          className={`tab ${state.activeTab === 'stats' ? 'active' : ''}`} 
          onClick={() => switchTab('stats')}
        >
          Statistics
        </div>
        <div 
          className={`tab ${state.activeTab === 'settings' ? 'active' : ''}`} 
          onClick={() => switchTab('settings')}
        >
          Settings
        </div>
      </div>

      <div className="content">
        {/* Dashboard Tab */}
        <div className={`tab-content ${state.activeTab === 'dashboard' ? 'active' : ''}`}>
          <div className="settings-section">
            <div className="setting-row">
              <span className="setting-label">AdBlocker Protection</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={state.enabled} 
                  onChange={toggleExtension} 
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
          
          <div className="stats-section">
            <h2>Quick Stats</h2>
            <div className="stats-row">
              <span className="stats-label">Total Blocked</span>
              <span className="stats-value">{state.stats.totalBlockedRequests}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Trackers Blocked</span>
              <span className="stats-value">{state.stats.totalTrackers}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Popups Blocked</span>
              <span className="stats-value">{state.stats.totalPopups}</span>
            </div>
          </div>
          
          <button className="btn btn-block" onClick={updateFilters}>
            Update Filter Lists
          </button>
        </div>

        {/* Stats Tab */}
        <div className={`tab-content ${state.activeTab === 'stats' ? 'active' : ''}`}>
          <div className="stats-section">
            <h2>Detailed Statistics</h2>
            <div className="stats-row">
              <span className="stats-label">Total Blocked</span>
              <span className="stats-value">{state.stats.totalBlockedRequests}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Trackers Blocked</span>
              <span className="stats-value">{state.stats.totalTrackers}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Popups Blocked</span>
              <span className="stats-value">{state.stats.totalPopups}</span>
            </div>
            
            <h3>Top Blocked Domains</h3>
            <div className="domain-list">
              {getTopDomains().map(([domain, count]) => (
                <div key={domain} className="domain-item">
                  <span className="domain-name">{domain}</span>
                  <span className="domain-count">{count}</span>
                </div>
              ))}
            </div>
            
            <button 
              className="btn btn-danger btn-block" 
              style={{ marginTop: '12px' }}
              onClick={resetStats}
            >
              Reset Statistics
            </button>
          </div>
        </div>

        {/* Settings Tab */}
        <div className={`tab-content ${state.activeTab === 'settings' ? 'active' : ''}`}>
          <div className="settings-section">
            <h2>Protection Settings</h2>
            <div className="setting-row">
              <span className="setting-label">Block Advertisements</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={state.blockAds} 
                  onChange={() => toggleSetting('blockAds')}
                  disabled={!state.enabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            
            <div className="setting-row">
              <span className="setting-label">Block Trackers</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={state.blockTrackers} 
                  onChange={() => toggleSetting('blockTrackers')}
                  disabled={!state.enabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            
            <div className="setting-row">
              <span className="setting-label">Block Malware</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={state.blockMalware} 
                  onChange={() => toggleSetting('blockMalware')}
                  disabled={!state.enabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            
            <div className="setting-row">
              <span className="setting-label">Block Popups</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={state.blockPopups} 
                  onChange={() => toggleSetting('blockPopups')}
                  disabled={!state.enabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
          
          <button className="btn btn-block" onClick={updateFilters}>
            Update Filter Lists
          </button>
        </div>
      </div>
      
      <div className="footer">
        AdBlocker Pro v1.0.0
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Popup />);