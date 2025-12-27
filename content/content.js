// content/content.js
console.log("Content script loaded for WhatsApp Web.");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Message received in content script:", msg);

  switch (msg.type) {
    case "GET_GROUPS_WITH_UNREAD":
      sendResponse({ groups: listGroupsWithUnread() });
      break;
    case "GET_CURRENT_GROUP":
      sendResponse({ group: getCurrentGroupInfo() });
      break;
    case "GET_LAST_N_MESSAGES":
      console.log("Fetching last, here with sender, ", msg.n, "messages...");
      getLastNMessages(msg.n).then((messages) => {
        sendResponse({ messages });
      });
      break;
    default:
      sendResponse({ error: "Unknown message type" });
      break;
  }

  // Return true to indicate that the response will be sent asynchronously
  return true;
});

function listGroupsWithUnread() {
  console.log("Listing groups with unread messages...");
  const groups = [];
  const chatElements = document.querySelectorAll('div[role="listitem"]');
  console.log(`Found ${chatElements.length} chat elements.`);

  chatElements.forEach((el, index) => {
    try {
      const unreadBadge = el.querySelector('span[aria-label*="unread"]');
      const unreadCountMatch = unreadBadge?.ariaLabel?.match(/(\d+)/);
      const unreadCount = unreadCountMatch
        ? parseInt(unreadCountMatch[1], 10)
        : 0;

      // Only process if there are unread messages or if it's a group chat
      if (unreadCount > 0) {
        const nameElement = el.querySelector("span[title]");
        const lastMessageElement = el.querySelector(
          '[data-testid="last-msg-status"], [data-testid="last-msg"]',
        );
        const timeElement = el.querySelector("time");
        const avatarElement = el.querySelector("img[src]");
        const isMuted = !!el.querySelector('[data-testid="muted"]');
        const isPinned = !!el.closest('[aria-label*="pinned"]');
        const isGroup = !!el.querySelector('[data-testid="group"]');
        const lastMessageTime = timeElement?.getAttribute("datetime") || "";

        if (nameElement) {
          // Create a unique selector for this group
          const groupName = nameElement.title || nameElement.textContent;
          const groupId = `group-${index}-${Date.now()}`;
          const groupSelector = `div[role="listitem"]:has(span[title="${groupName.replace(
            /"/g,
            '\\"',
          )}"])`;

          const groupInfo = {
            // Basic info
            id: groupId,
            name: groupName,
            unreadCount: unreadCount,
            selector: groupSelector, // Store the CSS selector instead of the element

            // Message info
            lastMessage: lastMessageElement?.textContent?.trim() || "",
            lastMessageTime: lastMessageTime,
            lastMessageTimestamp: lastMessageTime
              ? new Date(lastMessageTime).getTime()
              : 0,

            // Group metadata
            isGroup: isGroup,
            isMuted: isMuted,
            isPinned: isPinned,

            // Media and attachments
            hasUnreadMention: !!el.querySelector('[data-testid="mention"]'),
            hasMedia: !!el.querySelector(
              '[data-testid="media"], [data-testid*="media-"]',
            ),

            // Avatar info
            avatar: avatarElement?.src || "",
            avatarAlt: avatarElement?.alt || "",

            // Selectors for future reference
            selectors: {
              chatItem: 'div[role="listitem"]',
              unreadBadge: 'span[aria-label*="unread"]',
              nameElement: "span[title]",
              lastMessage: '[data-testid*="last-msg"]',
              timeElement: "time",
              avatar: "img[src]",
              muted: '[data-testid="muted"]',
              group: '[data-testid="group"]',
              mention: '[data-testid="mention"]',
              media: '[data-testid*="media"]',
            },
          };

          groups.push(groupInfo);
        }
      }
    } catch (error) {
      console.error("Error processing chat element:", error);
    }
  });

  // Sort by unread count (descending) and then by last message time (newest first)
  return groups.sort((a, b) => {
    if (b.unreadCount !== a.unreadCount) {
      return b.unreadCount - a.unreadCount;
    }
    return (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0);
  });
}

function getCurrentGroupInfo() {
  try {
    // Look for the group container
    const groupElement = document.querySelector(
      'div[role="button"][data-tab="6"]',
    );
    if (!groupElement) {
      console.warn("No group element found");
      return null;
    }

    // First check for span with title (members usually show here)
    const memberElement = groupElement.querySelector("span[title]");

    // Then check for span without title (group name usually here)
    const nameElement = groupElement.querySelector("span:not([title])");

    if (nameElement) {
      const name = nameElement.textContent.trim();
      return {
        id: name.replace(/\s+/g, "_").toLowerCase(),
        name: name,
        members: memberElement ? memberElement.getAttribute("title") : null,
      };
    }

    console.warn("Could not find group name");
    return null;
  } catch (error) {
    console.error("Error in getCurrentGroupInfo:", error);
    return null;
  }
}

function extractTextWithEmojis(el) {
  let text = "";

  const copyableText = el?.querySelector(".selectable-text.copyable-text");
  if (!copyableText) return text;
  
  const textNode = copyableText.querySelector("span");
  if (!textNode) return text;

  textNode.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeName === "IMG" && node.alt) {
      text += node.alt;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text += extractTextWithEmojis(node);
    }
  });
  return text;
}

// async function getLastNMessages(n) {
//   console.log(`[WhatsApp] Fetching last ${n} messages...`);
//   const messages = [];

//   const messageElements = document.querySelectorAll("div[role='row']");

//   const downArrowButton = document.querySelector(
//     "button[aria-label='Scroll to bottom']"
//   );

//   if (downArrowButton) {
//     console.log("[WhatsApp] Scrolling to bottom");
//     chrome.runtime.sendMessage({
//       action: "changeInfo",
//       text: "Scrolling to bottom...",
//     });
//     new Promise((resolve) => setTimeout(resolve, 1000));
//     downArrowButton.click();
//     new Promise((resolve) => setTimeout(resolve, 1000));
//     chrome.runtime.sendMessage({
//       action: "changeInfo",
//       text: "Done scrolling to bottom...",
//     });
//   }

//   for (let i = messageElements.length - 1; i >= 0 && messages.length < n; i--) {
//     const el = messageElements[i];

//     try {
//       const id = el.getAttribute("data-id") || `msg-${i}`;
//       const timestamp =
//         el.querySelector("time")?.getAttribute("datetime") ||
//         new Date().toISOString();

//       // Sender info (from data-pre-plain-text attribute)
//       const meta =
//         el
//           .querySelector("[data-pre-plain-text]")
//           ?.getAttribute("data-pre-plain-text") || "";
//       const senderMatch = meta.match(/\]\s(.*?):/);
//       const senderName = senderMatch ? senderMatch[1] : "Unknown";
//       const senderNumber = ""; // not available

//       // Quoted message
//       let quotedMessage = null;
//       const quotedContainer = el.querySelector(
//         "div[role='button'][aria-label*='Quoted']"
//       );
//       if (quotedContainer) {
//         quotedMessage = {
//           sender: quotedContainer.innerText.split("\n")[0] || "Unknown",
//           senderNumber: "",

//           text: quotedContainer.innerText.split("\n").slice(1).join(" ") || "",
//           // text:
//           //   extractTextWithEmojis(quotedContainer)
//           //     .split("\n")
//           //     .slice(1)
//           //     .join(" ")
//           //     .trim() || "",
//         };
//       }

//       // Full text extraction (with emojis)
//       let text = extractTextWithEmojis(el).trim();

//       // Remove quoted text if duplicated inside
//       if (
//         quotedMessage &&
//         quotedMessage.text &&
//         text.includes(quotedMessage.text)
//       ) {
//         text = text.replace(quotedMessage.text, "").trim();
//       }

//       // Remove sender prefix if duplicated
//       if (senderName !== "Unknown" && text.startsWith(senderName)) {
//         text = text.replace(senderName, "").trim();
//       }

//       // Remove trailing time (like "9:40 pm")
//       text = text.replace(/\n?\d{1,2}:\d{2}\s?(am|pm)?$/i, "").trim();

//       const isQuoted = !!quotedMessage;
//       const isForwarded = !!el.querySelector("span[aria-label*='Forwarded']");
//       const hasMedia = !!el.querySelector("img, video, audio");

//       messages.push({
//         id,
//         text,
//         sender: {
//           name: senderName,
//           number: senderNumber,
//         },
//         timestamp,
//         isQuoted,
//         quotedMessage,
//         isForwarded,
//         hasMedia,
//       });
//     } catch (err) {
//       console.warn("[WhatsApp] Failed to parse message:", err);
//     }
//   }

//   console.log("[WhatsApp] Fetched last", messages.length, "messages");

//   chrome.runtime.sendMessage({
//     action: "changeInfo",
//     text:
//       "Done fetching messages..., " + messages.length + " messages fetched.",
//   });

//   return messages;
// }

// async function getLastNMessages(n) {
//   console.log(`[WhatsApp] Fetching last ${n} messages...`);
//   const messages = [];

//   // Chat container (where messages are loaded)
//   const chatContainer = document.querySelector(
//     "div[role='application'] main div[role='region']"
//   );
//   if (!chatContainer) {
//     console.warn("[WhatsApp] Chat container not found");
//     return [];
//   }

//   // Helper to wait
//   const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//   // Keep scrolling up until enough messages are loaded
//   let messageElements = document.querySelectorAll("div[role='row']");
//   while (messageElements.length < n) {
//     console.log("[WhatsApp] Not enough messages, scrolling up...");
//     chrome.runtime.sendMessage({
//       action: "changeInfo",
//       text: `Scrolling up... loaded ${messageElements.length}/${n}`,
//     });

//     // Scroll up programmatically
//     chatContainer.scrollTop = 0;
//     await sleep(1500); // wait for messages to load

//     // Re-check messages
//     messageElements = document.querySelectorAll("div[role='row']");

//     // Break if no new messages are loaded (end of chat)
//     if (messageElements.length >= n || chatContainer.scrollTop === 0) {
//       break;
//     }
//   }

//   // If more than n messages, pick last n
//   const selectedMessages = Array.from(messageElements).slice(-n);

//   for (let i = 0; i < selectedMessages.length; i++) {
//     const el = selectedMessages[i];
//     try {
//       const id = el.getAttribute("data-id") || `msg-${i}`;
//       const timestamp =
//         el.querySelector("time")?.getAttribute("datetime") ||
//         new Date().toISOString();

//       const meta =
//         el
//           .querySelector("[data-pre-plain-text]")
//           ?.getAttribute("data-pre-plain-text") || "";
//       const senderMatch = meta.match(/\]\s(.*?):/);
//       const senderName = senderMatch ? senderMatch[1] : "Unknown";

//       let quotedMessage = null;
//       const quotedContainer = el.querySelector(
//         "div[role='button'][aria-label*='Quoted']"
//       );
//       if (quotedContainer) {
//         quotedMessage = {
//           sender: quotedContainer.innerText.split("\n")[0] || "Unknown",
//           senderNumber: "",
//           text: quotedContainer.innerText.split("\n").slice(1).join(" ") || "",
//         };
//       }

//       let text = extractTextWithEmojis(el).trim();

//       if (
//         quotedMessage &&
//         quotedMessage.text &&
//         text.includes(quotedMessage.text)
//       ) {
//         text = text.replace(quotedMessage.text, "").trim();
//       }

//       if (senderName !== "Unknown" && text.startsWith(senderName)) {
//         text = text.replace(senderName, "").trim();
//       }

//       text = text.replace(/\n?\d{1,2}:\d{2}\s?(am|pm)?$/i, "").trim();

//       const isQuoted = !!quotedMessage;
//       const isForwarded = !!el.querySelector("span[aria-label*='Forwarded']");
//       const hasMedia = !!el.querySelector("img, video, audio");

//       messages.push({
//         id,
//         text,
//         sender: {
//           name: senderName,
//           number: "",
//         },
//         timestamp,
//         isQuoted,
//         quotedMessage,
//         isForwarded,
//         hasMedia,
//       });
//     } catch (err) {
//       console.warn("[WhatsApp] Failed to parse message:", err);
//     }
//   }

//   console.log("[WhatsApp] Fetched last", messages.length, "messages");
//   chrome.runtime.sendMessage({
//     action: "changeInfo",
//     text:
//       "Done fetching messages..., " + messages.length + " messages fetched.",
//   });

//   return messages;
// }

function extractMediaFromMessage(el) {
  if (!el) return { hasMedia: false, media: [] };

  const media = [];

  try {
    const images = el.querySelectorAll('img[src*="blob:"], img[src*="mmg.whatsapp.net"]');
    images.forEach((img) => {
      if (!img?.src) return;
      if (img.src.includes('emoji') || img.src.includes('dyn')) return;
      if (img.width < 50 || img.height < 50) return;

      media.push({
        type: 'image',
        url: img.src,
        alt: img.alt || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    });

    const videos = el.querySelectorAll('video[src], video source[src]');
    videos.forEach((video) => {
      const src = video?.src || video?.querySelector?.('source')?.src;
      if (!src) return;

      media.push({
        type: 'video',
        url: src,
        duration: video.duration || null,
      });
    });

    const audioPlayers = el.querySelectorAll('[data-testid="audio-player"], audio[src]');
    audioPlayers.forEach((audio) => {
      const audioEl = audio.tagName === 'AUDIO' ? audio : audio.querySelector('audio');
      const src = audioEl?.src;
      if (!src) return;

      const durationEl = audio.querySelector('[data-testid="audio-duration"]');
      const durationText = durationEl?.textContent || '';

      media.push({
        type: 'audio',
        url: src,
        duration: durationText,
        isVoiceNote: !!audio.closest('[data-testid="ptt"]'),
      });
    });

    const stickerElements = el.querySelectorAll('[data-testid="sticker"] img');
    stickerElements.forEach((sticker) => {
      if (!sticker?.src) return;

      media.push({
        type: 'sticker',
        url: sticker.src,
        alt: sticker.alt || '',
      });
    });

    const docElements = el.querySelectorAll('[data-testid="document-thumb"]');
    docElements.forEach((doc) => {
      const nameEl = doc.closest('[data-testid="msg-container"]')?.querySelector('[data-testid="document-title"]');
      const sizeEl = doc.closest('[data-testid="msg-container"]')?.querySelector('[data-testid="document-size"]');

      media.push({
        type: 'document',
        name: nameEl?.textContent || 'Unknown document',
        size: sizeEl?.textContent || '',
      });
    });
  } catch (err) {
    console.warn('[WhatsApp] Error extracting media:', err);
  }

  return {
    hasMedia: media.length > 0,
    media: media,
  };
}

async function scrollToBottom() {
  let downArrowButton = document.querySelector(
    'button[aria-label="Scroll to bottom"]',
  );
  while (downArrowButton) {
    console.log("[WhatsApp] Scrolling to bottom");
    chrome.runtime.sendMessage({
      action: "changeInfo",
      text: "Scrolling to bottom...",
    });
    downArrowButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for scroll
    downArrowButton = document.querySelector(
      'button[aria-label="Scroll to bottom"]',
    );
  }
  chrome.runtime.sendMessage({
    action: "changeInfo",
    text: "Done scrolling to bottom...",
  });
}

const MAX_MESSAGES_LIMIT = 500;
const MAX_SCROLL_ATTEMPTS = 50;

async function getLastNMessages(n) {
  const effectiveN = Math.min(n, MAX_MESSAGES_LIMIT);
  if (n > MAX_MESSAGES_LIMIT) {
    console.warn(`[WhatsApp] Requested ${n} messages, limiting to ${MAX_MESSAGES_LIMIT}`);
    chrome.runtime.sendMessage({
      action: "changeInfo",
      text: `Limiting to ${MAX_MESSAGES_LIMIT} messages (safety limit)`,
    });
  }

  console.log(`[WhatsApp] Fetching last ${effectiveN} messages...`);
  const messages = [];

  await scrollToBottom();

  const chatContainer = document.querySelector(
    ".copyable-area>div[tabindex='0']",
  );
  if (!chatContainer) {
    console.warn("[WhatsApp] Chat container not found!");
    return {
      error: "NO_CHAT_CONTAINER",
    };
  }

  function extractMessages() {
    return Array.from(document.querySelectorAll("div[role='row']"));
  }

  function extractTextWithEmojisAndLinks(el) {
    if (!el) return "";

    let parts = new Set();

    try {
      const textNodes = el.querySelectorAll("span.selectable-text.copyable-text");
      textNodes?.forEach((node) => {
        if (node?.innerText?.trim()) parts.add(node.innerText.trim());
      });

      const linkNodes = el.querySelectorAll("a[href]");
      linkNodes?.forEach((a) => {
        if (a?.href) parts.add(a.href.trim());
      });

      const previewNodes = el.querySelectorAll("span._ao3e");
      previewNodes?.forEach((span) => {
        if (span?.innerText?.trim()) parts.add(span.innerText.trim());
      });
    } catch (err) {
      console.warn("[WhatsApp] Error extracting text:", err);
    }

    return Array.from(parts).join(" ").trim();
  }

  let messageElements = extractMessages();
  let scrollAttempts = 0;
  let lastMessageCount = 0;
  let noNewMessagesCount = 0;

  while (messageElements.length < effectiveN && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
    scrollAttempts++;

    console.log(
      `[WhatsApp] Attempt ${scrollAttempts}/${MAX_SCROLL_ATTEMPTS}: ${messageElements.length}/${effectiveN} messages`,
    );

    chrome.runtime.sendMessage({
      action: "changeInfo",
      text: `Loading... ${messageElements.length}/${effectiveN} (attempt ${scrollAttempts}/${MAX_SCROLL_ATTEMPTS})`,
    });

    let prevHeight = chatContainer.scrollHeight;
    chatContainer.scrollTo(0, 0);

    await new Promise((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          console.log("[WhatsApp] Observer timeout - no new messages loaded");
          resolve();
        }
      }, 5000);

      const observer = new MutationObserver(() => {
        let newHeight = chatContainer.scrollHeight;
        if (newHeight > prevHeight && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(chatContainer, { childList: true, subtree: true });
    });

    messageElements = extractMessages();

    if (messageElements.length === lastMessageCount) {
      noNewMessagesCount++;
      if (noNewMessagesCount >= 3) {
        console.log("[WhatsApp] No new messages after 3 attempts, stopping scroll");
        chrome.runtime.sendMessage({
          action: "changeInfo",
          text: `Reached end of chat history (${messageElements.length} messages)`,
        });
        break;
      }
    } else {
      noNewMessagesCount = 0;
      lastMessageCount = messageElements.length;
    }
  }

  if (scrollAttempts >= MAX_SCROLL_ATTEMPTS) {
    console.warn(`[WhatsApp] Reached max scroll attempts (${MAX_SCROLL_ATTEMPTS})`);
    chrome.runtime.sendMessage({
      action: "changeInfo",
      text: `Stopped at ${messageElements.length} messages (max attempts reached)`,
    });
  }

  const neededMessages = messageElements.slice(-effectiveN);

  for (let i = neededMessages.length - 1; i >= 0; i--) {
    const el = neededMessages[i];
    if (!el) continue;
    
    try {
      const id = el.firstChild?.getAttribute?.("data-id") || `msg-${i}`;
      const timeEl = el.querySelector("time");
      const timestamp = timeEl?.getAttribute?.("datetime") || new Date().toISOString();

      const prePlainTextEl = el.querySelector("[data-pre-plain-text]");
      const meta = prePlainTextEl?.getAttribute?.("data-pre-plain-text") || "";
      const senderMatch = meta.match(/]\s(.*?):/);

      let senderName = senderMatch ? senderMatch[1] : "Unknown";

      if (senderName === "Unknown") {
        const ariaLabelEl = el.querySelector("[aria-label]");
        if (ariaLabelEl) {
          const ariaLabel = ariaLabelEl.getAttribute("aria-label") || "";
          const isEmoji = /:$/.test(ariaLabel);
          if (isEmoji) {
            senderName = ariaLabel.replace(":", "");
          }
        }
      }

      let quotedMessage = null;
      try {
        const quotedContainer = el.querySelector(
          "div[role='button'][aria-label*='Quoted']",
        );
        if (quotedContainer?.innerText) {
          const lines = quotedContainer.innerText.split("\n");
          quotedMessage = {
            sender: lines[0] || "Unknown",
            senderNumber: "",
            text: lines.slice(1).join(" ") || "",
          };
        }
      } catch (quotedErr) {
        console.warn("[WhatsApp] Failed to parse quoted message:", quotedErr);
      }

      let text = "";
      try {
        text = extractTextWithEmojisAndLinks(el);
      } catch (extractErr) {
        console.warn("[WhatsApp] Failed to extract text from message:", extractErr);
      }

      if (
        quotedMessage &&
        quotedMessage.text &&
        text.includes(quotedMessage.text)
      ) {
        text = text.replace(quotedMessage.text, "").trim();
      }

      if (senderName !== "Unknown" && text.startsWith(senderName)) {
        text = text.replace(senderName, "").trim();
      }

      text = text.replace(/\n?\d{1,2}:\d{2}\s?(am|pm)?$/i, "").trim();

      const mediaData = extractMediaFromMessage(el);

      messages.push({
        id,
        text,
        sender: { name: senderName, number: "" },
        timestamp,
        isQuoted: !!quotedMessage,
        quotedMessage,
        isForwarded: !!el.querySelector("span[aria-label*='Forwarded']"),
        hasMedia: mediaData.hasMedia,
        media: mediaData.media,
      });
    } catch (err) {
      console.warn("[WhatsApp] Failed to parse message:", err);
    }
  }

  console.log("[WhatsApp] Fetched last", messages.length, "messages");

  chrome.runtime.sendMessage({
    action: "changeInfo",
    text: `Done fetching messages..., ${messages.length} messages fetched.`,
  });

  return messages;
}
