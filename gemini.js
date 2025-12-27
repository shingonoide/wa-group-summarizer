// chrome-extension/gemini.js

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const QUOTA_STATE_KEY = "quotaState";
const MODELS_CACHE_KEY = "cachedModels";
const MODELS_CACHE_TIME_KEY = "modelsCacheTime";
const MODELS_CACHE_DURATION = 24 * 60 * 60 * 1000;

export const CURATED_MODELS = {
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite (Fast)",
    capabilities: { text: true, image: false, audio: false },
    freeRPM: 15,
    recommended: true,
    description: "Best for text-only summaries, fastest and most quota-efficient"
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash (Multimodal)",
    capabilities: { text: true, image: true, audio: true },
    freeRPM: 10,
    recommended: false,
    description: "Full multimodal support for images and audio"
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    capabilities: { text: true, image: true, audio: true },
    freeRPM: 10,
    recommended: false,
    description: "Stable multimodal model"
  }
};

export const MODEL_FOR_TEXT = "gemini-2.5-flash-lite";
export const MODEL_FOR_MULTIMODAL = "gemini-2.5-flash";

export class GeminiError extends Error {
  constructor(message, type, retryAfter = null) {
    super(message);
    this.name = "GeminiError";
    this.type = type; // 'QUOTA_EXCEEDED', 'RATE_LIMITED', 'API_ERROR', 'NETWORK_ERROR'
    this.retryAfter = retryAfter; // seconds to wait before retry
  }
}

export async function setQuotaExceeded(retryAfter) {
  const retryAt = Date.now() + (retryAfter * 1000);
  await chrome.storage.local.set({
    [QUOTA_STATE_KEY]: { exceeded: true, retryAt }
  });
}

export async function clearQuotaState() {
  await chrome.storage.local.remove(QUOTA_STATE_KEY);
}

export async function canMakeRequest() {
  const result = await chrome.storage.local.get(QUOTA_STATE_KEY);
  const quotaState = result[QUOTA_STATE_KEY];
  
  if (!quotaState?.exceeded) return { allowed: true };

  const now = Date.now();
  if (now >= quotaState.retryAt) {
    await chrome.storage.local.remove(QUOTA_STATE_KEY);
    return { allowed: true };
  }

  const waitSeconds = Math.ceil((quotaState.retryAt - now) / 1000);
  return { allowed: false, waitSeconds };
}

export function estimateTokens(messages) {
  if (!messages?.length) return { inputTokens: 0, messageCount: 0 };
  
  let totalChars = 0;
  messages.forEach(msg => {
    totalChars += (msg.text?.length || 0);
    totalChars += (msg.sender?.name?.length || 0) + 20; // overhead per message
    if (msg.quotedMessage) {
      totalChars += (msg.quotedMessage.text?.length || 0);
      totalChars += (msg.quotedMessage.sender?.length || 0);
    }
  });

  const promptOverhead = 800; // base prompt tokens
  const estimatedTokens = Math.ceil(totalChars / 4) + promptOverhead;

  return {
    inputTokens: estimatedTokens,
    messageCount: messages.length,
    withinFreeLimit: estimatedTokens < 30000 // reasonable single request limit
  };
}

export async function summarizeMessages(
  apiKey,
  model = DEFAULT_MODEL,
  messages,
  summaryLength = "standard"
) {
  console.log("[Gemini] Starting message summarization", {
    messageCount: messages?.length,
  });

  if (!apiKey) {
    const errorMsg = "No API key provided for Gemini";
    console.error("[Gemini] Error:", errorMsg);
    throw new Error(errorMsg);
  }

  if (!messages?.length) {
    const errorMsg = "No messages provided for summarization";
    console.warn("[Gemini] Warning:", errorMsg);
    return {
      success: true,
      data: { tldr: "No messages to summarize", keyPoints: [], links: [], contextStatus: { isIncomplete: false }, participants: [] },
      metadata: null
    };
  }

  try {
    const prompt = createPrompt(messages, summaryLength);
    console.debug("[Gemini] Created prompt with character length:", prompt.length);

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
        stopSequences: [],
      },
    };

    console.log("[Gemini] Sending request to Gemini API...");
    const startTime = Date.now();

    const response = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const responseTime = Date.now() - startTime;
    console.log(`[Gemini] Received API response in ${responseTime}ms`, { status: response.status });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
        console.error("[Gemini] API Error:", errorData);
      } catch (e) {
        console.error("[Gemini] Failed to parse error response:", e);
        throw new GeminiError(`API request failed with status ${response.status}`, "NETWORK_ERROR");
      }

      const errorMessage = errorData.error?.message || "Unknown error";
      
      if (response.status === 429 || errorMessage.toLowerCase().includes("quota")) {
        const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
        const retryAfter = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
        
        await setQuotaExceeded(retryAfter);
        
        throw new GeminiError(
          `API quota exceeded. Please wait ${retryAfter} seconds before trying again.`,
          "QUOTA_EXCEEDED",
          retryAfter
        );
      }
      
      if (response.status === 400) {
        throw new GeminiError(`Invalid request: ${errorMessage}`, "API_ERROR");
      }
      
      throw new GeminiError(`Gemini API error: ${errorMessage}`, "API_ERROR");
    }

    const data = await response.json();
    console.debug("[Gemini] Raw API response:", data);

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("[Gemini] Unexpected response format:", data);
      throw new Error("Unexpected response format from Gemini API");
    }

    const summaryText = data.candidates[0].content.parts[0].text;
    console.log("[Gemini] Successfully received summary text");

    const parsed = parseStructuredResponse(summaryText);
    const metadata = extractMetadata(messages);

    return {
      ...parsed,
      metadata
    };
  } catch (error) {
    console.error("[Gemini] Error in summarizeMessages:", error);
    throw error;
  }
}

function parseStructuredResponse(text) {
  try {
    let jsonStr = text.trim();

    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.tldr || !Array.isArray(parsed.keyPoints)) {
      throw new Error('Missing required fields');
    }

    console.log("[Gemini] Successfully parsed structured response");
    return {
      success: true,
      data: {
        tldr: parsed.tldr || '',
        keyPoints: parsed.keyPoints || [],
        links: parsed.links || [],
        contextStatus: parsed.contextStatus || { isIncomplete: false, reason: '', suggestion: '' },
        participants: parsed.participants || []
      }
    };
  } catch (error) {
    console.warn('[Gemini] Failed to parse JSON, attempting manual extraction:', error.message);

    try {
      const tldrMatch = text.match(/"tldr"\s*:\s*"([^"]+)"/);
      const keyPointsMatch = text.match(/"keyPoints"\s*:\s*\[([\s\S]*?)\]/);

      if (tldrMatch && keyPointsMatch) {
        const keyPointsStr = keyPointsMatch[1];
        const keyPoints = keyPointsStr.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];

        console.log("[Gemini] Manual extraction successful");
        return {
          success: true,
          data: {
            tldr: tldrMatch[1],
            keyPoints: keyPoints,
            links: [],
            contextStatus: { isIncomplete: false, reason: '', suggestion: '' },
            participants: []
          }
        };
      }
    } catch (e) {
      console.warn('[Gemini] Manual extraction also failed');
    }

    return {
      success: false,
      rawText: text
    };
  }
}

function extractMetadata(messages) {
  if (!messages?.length) return null;
  
  const timestamps = messages
    .map(m => m.timestamp)
    .filter(Boolean)
    .sort();
  
  const senderCounts = {};
  messages.forEach(m => {
    const name = m.sender?.name || 'Unknown';
    senderCounts[name] = (senderCounts[name] || 0) + 1;
  });
  
  return {
    messageCount: messages.length,
    period: {
      start: timestamps[0] || null,
      end: timestamps[timestamps.length - 1] || null
    },
    topSenders: Object.entries(senderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
  };
}


async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve({
          mimeType: blob.type || 'image/jpeg',
          data: base64
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[Gemini] Failed to fetch image as base64:', error);
    return null;
  }
}

export async function describeImage(apiKey, imageUrl, context = '') {
  console.log('[Gemini] Describing image...');

  const imageData = await fetchImageAsBase64(imageUrl);
  if (!imageData) {
    return { success: false, error: 'Failed to load image' };
  }

  const prompt = context
    ? `Describe this image briefly in context of a WhatsApp chat. Context: ${context}. Be concise (1-2 sentences).`
    : `Describe this image briefly in context of a WhatsApp chat. Be concise (1-2 sentences).`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: imageData }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 256,
    }
  };

  try {
    const response = await fetch(`${API_BASE}/${MODEL_FOR_MULTIMODAL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Status ${response.status}`;

      if (response.status === 429) {
        throw new GeminiError('Quota exceeded while describing image', 'QUOTA_EXCEEDED', 60);
      }
      throw new GeminiError(`Failed to describe image: ${errorMessage}`, 'API_ERROR');
    }

    const data = await response.json();
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Image could not be described';

    return { success: true, description };
  } catch (error) {
    console.error('[Gemini] Error describing image:', error);
    throw error;
  }
}

export async function summarizeWithMedia(apiKey, messages, options = {}) {
  const {
    includeMedia = false,
    summaryLength = 'standard',
    maxMediaItems = 5,
    onProgress = null
  } = options;

  console.log('[Gemini] Starting summarization', { includeMedia, messageCount: messages?.length });

  const hasMediaContent = messages?.some(m => m.media?.length > 0);

  if (!includeMedia || !hasMediaContent) {
    console.log('[Gemini] Using text-only model (no media or media disabled)');
    return summarizeMessages(apiKey, MODEL_FOR_TEXT, messages, summaryLength);
  }

  console.log('[Gemini] Using multimodal pipeline');

  const mediaDescriptions = [];
  let processedCount = 0;

  const allMedia = [];
  messages.forEach((msg, msgIndex) => {
    if (msg.media?.length) {
      msg.media.forEach((mediaItem) => {
        if (mediaItem.type === 'image' || mediaItem.type === 'sticker') {
          allMedia.push({
            ...mediaItem,
            messageIndex: msgIndex,
            sender: msg.sender?.name || 'Unknown',
            timestamp: msg.timestamp
          });
        }
      });
    }
  });

  const mediaToProcess = allMedia.slice(0, maxMediaItems);
  console.log(`[Gemini] Processing ${mediaToProcess.length} media items`);

  for (const media of mediaToProcess) {
    try {
      if (onProgress) {
        onProgress({
          type: 'media_progress',
          current: processedCount + 1,
          total: mediaToProcess.length,
          mediaType: media.type
        });
      }

      const result = await describeImage(
        apiKey,
        media.url,
        `Sent by ${media.sender}`
      );

      if (result.success) {
        mediaDescriptions.push({
          sender: media.sender,
          timestamp: media.timestamp,
          type: media.type,
          description: result.description
        });
      }

      processedCount++;
    } catch (error) {
      console.warn('[Gemini] Failed to process media item:', error);
      if (error instanceof GeminiError && error.type === 'QUOTA_EXCEEDED') {
        throw error;
      }
    }
  }

  const enrichedMessages = messages.map(msg => {
    const msgMedia = mediaDescriptions.filter(
      md => md.sender === msg.sender?.name && md.timestamp === msg.timestamp
    );

    if (msgMedia.length > 0) {
      const mediaText = msgMedia.map(m => `[${m.type}: ${m.description}]`).join(' ');
      return {
        ...msg,
        text: msg.text ? `${msg.text} ${mediaText}` : mediaText
      };
    }
    return msg;
  });

  if (onProgress) {
    onProgress({ type: 'summarizing' });
  }

  return summarizeMessages(apiKey, MODEL_FOR_TEXT, enrichedMessages, summaryLength);
}

export function getCuratedModelsList() {
  return Object.values(CURATED_MODELS);
}

export function getModelCapabilities(modelId) {
  return CURATED_MODELS[modelId] || null;
}

export async function listAvailableModels(apiKey, forceRefresh = false) {
  console.log("[Gemini] Fetching available models...");

  if (!apiKey) {
    throw new Error("No API key provided");
  }

  try {
    if (!forceRefresh) {
      const cached = await chrome.storage.local.get([MODELS_CACHE_KEY, MODELS_CACHE_TIME_KEY]);
      const now = Date.now();

      if (cached[MODELS_CACHE_KEY] && cached[MODELS_CACHE_TIME_KEY]) {
        if (now - cached[MODELS_CACHE_TIME_KEY] < MODELS_CACHE_DURATION) {
          console.log("[Gemini] Using cached models");
          return cached[MODELS_CACHE_KEY];
        }
      }
    }

    const response = await fetch(`${API_BASE}?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    const models = data.models
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => ({
        id: m.name.replace("models/", ""),
        displayName: m.displayName || m.name.replace("models/", ""),
        description: m.description || ""
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    await chrome.storage.local.set({
      [MODELS_CACHE_KEY]: models,
      [MODELS_CACHE_TIME_KEY]: Date.now()
    });

    console.log(`[Gemini] Fetched and cached ${models.length} available models`);
    return models;
  } catch (error) {
    console.error("[Gemini] Error listing models:", error);
    throw error;
  }
}

function createPrompt(messages, summaryLength = "standard") {
  console.log("[Gemini] Creating prompt from messages");

  let tldrGuidance = "";
  let bulletsGuidance = "";
  if (summaryLength === "concise") {
    tldrGuidance = "2-3 sentences, concise overview of main outcome";
    bulletsGuidance = "3-5 bullet points, most important facts only";
  } else if (summaryLength === "comprehensive") {
    tldrGuidance = "6-8 sentences, detailed overview with context and nuances";
    bulletsGuidance = "12-15 bullet points, include details, decisions, action items, media mentions";
  } else {
    tldrGuidance = "4-6 sentences, main themes, tone, decisions and outcomes";
    bulletsGuidance = "7-10 bullet points, key decisions, who raised what, action items";
  }

  let prompt = `You are a WhatsApp group chat summarizer. Analyze the messages and return ONLY valid JSON (no markdown, no code blocks).

CRITICAL: Return ONLY the JSON object, nothing else. No \`\`\`json, no explanations.

Analyze for:
1. Main topics and outcomes
2. Whether context appears INCOMPLETE (conversation starts mid-discussion, references earlier content not shown, abrupt beginning)
3. Key participants

Return this exact JSON structure:
{
  "tldr": "${tldrGuidance}",
  "keyPoints": ["point1", "point2", ...] (${bulletsGuidance}),
  "links": [{"context": "what the link is about", "url": "https://..."}],
  "contextStatus": {
    "isIncomplete": true or false,
    "reason": "why it seems incomplete (empty if complete)",
    "suggestion": "e.g. 'Try loading 50-100 more messages' (empty if complete)"
  },
  "participants": [{"name": "Name", "messageCount": 5}, ...]
}

Context detection tips:
- If first messages reference "what was said before" or reply to unknown context → incomplete
- If conversation starts with "anyway", "so", "but" suggesting prior discussion → incomplete  
- If there are quoted messages from content not in the provided messages → incomplete
- If it's a natural conversation start (greetings, new topic introduction) → complete

Guidelines:
- Be specific, avoid generic summaries
- Group similar opinions together
- Capture conversation tone for casual chats
- List top 5 participants by message count
- Output in the same language as the conversation
- Include ALL shared links with context

Messages to analyze:
`;

  messages
    .slice(-300)
    .reverse()
    .forEach((msg) => {
      const timestamp = msg.timestamp || new Date().toISOString();
      const senderName = msg.sender?.name || "Unknown";

      let line = `[${timestamp}] ${senderName}: `;

      if (msg.isForwarded) {
        line += "(Forwarded) ";
      }

      if (msg.isQuoted && msg.quotedMessage) {
        const qmSender = msg.quotedMessage.sender || "Unknown";
        const qmText = msg.quotedMessage.text || "";
        line += `[Replying to ${qmSender}: "${qmText}"] `;
      }

      if (msg.text) {
        line += msg.text;
      }

      if (msg.hasMedia) {
        line += " [Media]";
      }

      prompt += line.trim() + "\\n";
    });

  console.log("[Gemini] Prompt created, length:", prompt.length);

  return prompt;
}

