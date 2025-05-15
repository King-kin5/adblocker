# AdBlocker Pro

A powerful Chrome extension designed to block ads, popups, trackers, and malware across the web. It features specialized filters for problematic domains and aggressive popup blocking mechanisms.

## Features

- **Ad Blocking**: Blocks ads across websites using filter lists and custom rules
- **Popup Blocking**: Detects and blocks popup windows and overlay ads
- **Anti-Tracking**: Prevents tracking scripts from collecting your data
- **Malware Protection**: Blocks domains known to distribute malware
- **Custom Filters**: Uses declarativeNetRequest rules with support for custom filter lists
- **Statistics Dashboard**: Track how many ads, popups, and trackers have been blocked
- **Content Script Injection**: Prevents popup-generating JavaScript on problematic websites

## Installation

### From Source

1. Clone this repository
   ```
   git clone https://github.com/King_kin5/adblocker.git
   cd adblocker
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Build the extension
   ```
   npm run build
   ```

4. Load the extension in Chrome
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder from this project

## Usage

After installation, AdBlocker Pro will automatically start blocking ads and popups. You can:

1. Click the extension icon to access the popup interface
2. Toggle blocking on/off using the switch
3. Configure specific blocking features in the Settings tab
4. View statistics on blocked content in the Stats tab
5. Update filter lists with the "Update Filter Lists" button



## Customizing Filters

You can add custom filter rules to `custom-filters.txt`. These rules use AdBlock Plus filter syntax.

After modifying the filters, run:
```
npm run update-rules
```

Then rebuild the extension:
```
npm run build
```

## Technology Stack

- TypeScript
- React
- WebExtension API
- declarativeNetRequest for content blocking
- Content scripts for DOM manipulation

## Development

- Run `npm run watch` for a development build that updates as you make changes
- Run `npm run lint` to check for code issues
- Run `npm run test` to execute tests

## Acknowledgements

- Filter lists from EasyList and other public sources
- @cliqz/adblocker-webextension for the core blocking engine 