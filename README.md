# WA Messages Summarizer

Chrome Extension (Manifest V3) that uses Google Gemini AI to summarize WhatsApp Web conversations (chats and groups).

## Features

- **Smart Summarization**: Summarize 50-500 messages with one click
- **Multimodal Support**: Optionally analyze images in conversations
- **Highlights**: Surfaces important messages (deadlines, action items, decisions)
- **Curated Models**: Pre-selected Gemini models optimized for chat summarization
- **Structured Output**: TL;DR, key points, highlights, links, and participant stats
- **Context Detection**: Warns when conversation appears incomplete
- **Quota Management**: Tracks API usage with countdown timer and token display
- **Light/Dark Theme**: Automatically follows your OS color scheme
- **Local History**: Save summaries for later reference

## Installation

1. Clone this repository
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
6. Enter your API key in the extension options

## Usage

1. Open WhatsApp Web
2. Navigate to any chat or group
3. Click the extension icon or open the side panel
4. Select number of messages to summarize
5. Click "Summarize Current Chat"

## Configuration

Access settings via the extension options:

- **API Key**: Your Gemini API key
- **Model**: Choose between text-only or multimodal models
- **Summary Length**: Concise, Standard, or Comprehensive
- **Include Images**: Enable image analysis (uses more quota)
- **Save History**: Auto-save summaries locally

## Highlights Criteria

The AI automatically highlights messages containing:
- Deadlines (dates, "X days left")
- Action items (requests, tasks)
- Important decisions
- Tools/resources (links, apps mentioned)
- Announcements

The number of highlights varies by summary length setting.

## Safety Limits

- Maximum 500 messages per request
- Maximum 50 scroll attempts when loading messages
- Automatic stop when end of chat history is reached

## Privacy

- Messages are sent to Google Gemini API for processing
- API key stored securely in browser sync storage
- Summaries optionally saved in local storage only
- No data collection or analytics

## License

MIT License
