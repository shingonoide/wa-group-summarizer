# Learnings from WhatsApp Summarizer Extension Session

## Key Discovery: Real Problem vs Initial Hypothesis

**Initial suspicion**: Model `gemini-2.5-flash-lite` might not exist anymore
**Actual problem**: Null pointer errors in WhatsApp Web DOM scraping

The model exists and works fine. The real issue was in `content/content.js` where DOM element access wasn't null-safe.

## Critical Bug Pattern: WhatsApp DOM Scraping

WhatsApp Web messages include various types:
- Regular user messages
- System messages (user joined, left, etc.)
- Notifications
- Deleted messages
- Emoji-only messages

Not all message types have the same DOM structure. Code like:
```javascript
el.querySelector("[aria-label]").getAttribute("aria-label")
```
Will crash when `querySelector` returns `null`.

**Fix pattern**:
```javascript
const ariaLabelEl = el.querySelector("[aria-label]");
if (ariaLabelEl) {
  const ariaLabel = ariaLabelEl.getAttribute("aria-label") || "";
}
```

Also use optional chaining for nested access:
```javascript
const id = el.firstChild?.getAttribute?.("data-id") || `msg-${i}`;
```

## Gemini API Facts

- Base URL: `https://generativelanguage.googleapis.com/v1beta/models`
- Model `gemini-2.5-flash-lite` EXISTS and works (confirmed Dec 2024)
- API returns 30+ models including Gemini 3 preview models
- Filter models by `supportedGenerationMethods.includes("generateContent")`
- Exclude embedding, vision, and aqa models for text summarization

## Playwright MCP Best Practices

### Use Sparingly
- `browser_snapshot` returns 100k+ characters - avoid unless necessary
- Prefer `browser_console_messages` for debugging
- Simple navigation and clicks work well

### Debugging Chrome Extensions
1. Load extension via chrome://extensions/
2. Use `browser_console_messages` to check for errors
3. Look for prefixed logs: `[WhatsApp]`, `[Gemini]`
4. Pattern `TypeError: Cannot read properties of null` = DOM access issue

### When Complex Operations Needed
Ask user to:
- Take screenshot and share
- Describe what they see
- Copy console output manually

## Chrome Extension ES Modules

Options page needs `type="module"` in script tag to use ES imports:
```html
<script type="module" src="options.js"></script>
```

## Testing Results

Before fix: 14/50 messages parsed (28% success)
After fix: 100/100 messages parsed (100% success)
