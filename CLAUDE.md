# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WA Messages Summarizer - Chrome Extension (Manifest V3) that uses Google Gemini AI to summarize WhatsApp Web conversations (both individual chats and groups).

## Architecture

```
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker - opens side panel on click
├── gemini.js              # Gemini API integration and prompt engineering
├── content/content.js     # Injected into WhatsApp Web - scrapes messages
├── sidepanel/             # Primary UI for summarization
├── popup/                 # Alternative UI (same logic as sidepanel)
├── options/               # Settings page and summary history
└── scripts/               # Icon generation utilities
```

## Key Technical Details

### API Integration (gemini.js)
- Uses Google Generative Language API: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Default model: `gemini-2.5-flash-lite`
- The endpoint must be dynamic - model parameter is passed to the function and used in the URL
- Prompt requests: TL;DR, key points (bullets), and links section
- `listAvailableModels(apiKey)` fetches all available models from API

### Message Flow
1. UI triggers `getLastNMessages(n)` via messaging module
2. Content script scrapes WhatsApp Web DOM, returns message array
3. UI calls `summarizeMessages()` in gemini.js
4. Summary displayed in UI

### Storage
- `chrome.storage.sync`: API key, model selection, preferences
- `chrome.storage.local`: Saved summaries (keyed by timestamp)

### WhatsApp Web Scraping
- Selectors may break when WhatsApp updates their UI
- Message extraction uses `div[role='row']` and `[data-pre-plain-text]` attributes
- **CRITICAL**: Messages must be queried within `chatContainer`, not the entire document, to avoid picking up messages from the chat list sidebar
- Auto-scrolls to load more messages when needed
- **CRITICAL**: Always use optional chaining (`?.`) when accessing DOM properties - elements may be null for system messages, notifications, or deleted messages

### Safety Limits (content.js)
- `MAX_MESSAGES_LIMIT = 500` - Maximum messages per request
- `MAX_SCROLL_ATTEMPTS = 50` - Maximum scroll attempts when loading
- Auto-stops after 3 consecutive attempts with no new messages
- 5 second timeout on scroll observer

## Development

### Loading the Extension
```bash
# In Chrome:
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this directory
```

### Regenerate Icons
```bash
npm init -y
npm install sharp --save-dev
node scripts/generate-icons.js
```

### Testing
No automated tests - manual testing via Chrome DevTools. Enable debug logging with `console.log` statements.

## Important Patterns

- Always use `getLastNMessages()` helper for scraping - don't duplicate DOM logic
- Side panel is primary interface; popup is fallback
- Summaries output in the same language as the conversation (auto-detect)
- API key validation: must start with `AIza`
- Options page uses ES modules (`type="module"`) for imports

## Known Issues and Solutions

### WhatsApp DOM Scraping Null Pointer
When scraping messages, always guard against null elements:
```javascript
// BAD - crashes on system messages
el.querySelector("[aria-label]").getAttribute("aria-label")

// GOOD - safe access
const ariaLabelEl = el.querySelector("[aria-label]");
if (ariaLabelEl) {
  const ariaLabel = ariaLabelEl.getAttribute("aria-label") || "";
}

// Also use optional chaining for data attributes
const id = el.firstChild?.getAttribute?.("data-id") || `msg-${i}`;
```

### Dynamic Model Loading
Options page loads models dynamically from Gemini API with fallback:
- Fetches from `https://generativelanguage.googleapis.com/v1beta/models`
- Filters for models supporting `generateContent`
- Falls back to hardcoded list if API fails

## Playwright Testing Guidelines

When MCP Playwright is available for browser testing:

### Preferred Operations
- `browser_navigate` - Navigate to URLs
- `browser_console_messages` - Check for errors/logs (essential for debugging)
- `browser_click` - Simple clicks on elements
- `browser_type` - Text input

### Avoid These Operations
- `browser_snapshot` - Page snapshots are very large and consume context
- Complex scrolling operations - WhatsApp Web has custom scroll behavior
- Multiple rapid interactions - Can trigger rate limits

### When Complex Operations Are Needed
Ask the user to:
1. Take a screenshot manually and share it
2. Describe what they see on screen
3. Copy relevant console output

### Debugging Flow
1. Use `browser_console_messages` first to check for errors
2. Look for `[WhatsApp]` or `[Gemini]` prefixed log messages
3. Error patterns like `TypeError: Cannot read properties of null` indicate DOM scraping issues
