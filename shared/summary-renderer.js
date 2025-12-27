const ICONS = {
  tldr: '📋',
  keyPoints: '📌',
  highlights: '⭐',
  links: '🔗',
  period: '📅',
  messages: '💬',
  participants: '👥',
  warning: '⚠️',
  expand: '📥'
};

export function renderSummary(result, containerElement, options = {}) {
  const { onExpandContext } = options;
  
  containerElement.innerHTML = '';
  containerElement.className = 'summary-container';
  
  if (result.metadata) {
    containerElement.appendChild(createMetadataBar(result.metadata));
  }
  
  if (result.success && result.data) {
    renderStructuredSummary(result.data, containerElement, onExpandContext);
  } else if (result.rawText) {
    renderRawSummary(result.rawText, containerElement);
  }
}

function createMetadataBar(metadata) {
  const bar = document.createElement('div');
  bar.className = 'summary-metadata';
  
  if (metadata.period?.start && metadata.period?.end) {
    const periodEl = document.createElement('span');
    periodEl.className = 'metadata-item';
    periodEl.innerHTML = `${ICONS.period} ${formatPeriod(metadata.period.start, metadata.period.end)}`;
    bar.appendChild(periodEl);
  }
  
  const countEl = document.createElement('span');
  countEl.className = 'metadata-item';
  countEl.innerHTML = `${ICONS.messages} ${metadata.messageCount} msgs`;
  bar.appendChild(countEl);
  
  if (metadata.topSenders?.length) {
    const participantsEl = document.createElement('span');
    participantsEl.className = 'metadata-item metadata-participants';
    const names = metadata.topSenders.slice(0, 3).map(s => s.name).join(', ');
    participantsEl.innerHTML = `${ICONS.participants} ${names}`;
    participantsEl.title = metadata.topSenders.map(s => `${s.name}: ${s.count} msgs`).join('\n');
    bar.appendChild(participantsEl);
  }
  
  return bar;
}

function renderStructuredSummary(data, container, onExpandContext) {
  if (data.contextStatus?.isIncomplete) {
    container.appendChild(createContextWarning(data.contextStatus, onExpandContext));
  }

  container.appendChild(createSection('TL;DR', ICONS.tldr, data.tldr, 'tldr'));

  if (data.keyPoints?.length) {
    container.appendChild(createBulletSection('Key Points', ICONS.keyPoints, data.keyPoints, 'key-points'));
  }

  if (data.highlights?.length) {
    container.appendChild(createHighlightsSection(data.highlights));
  }

  if (data.links?.length) {
    container.appendChild(createLinksSection(data.links));
  }
}

function createSection(title, icon, content, className) {
  const section = document.createElement('div');
  section.className = `summary-section ${className}`;
  
  const header = document.createElement('h3');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-icon">${icon}</span> ${title}`;
  section.appendChild(header);
  
  const body = document.createElement('div');
  body.className = 'section-content';
  body.textContent = content;
  section.appendChild(body);
  
  return section;
}

function createBulletSection(title, icon, items, className) {
  const section = document.createElement('div');
  section.className = `summary-section ${className}`;
  
  const header = document.createElement('h3');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-icon">${icon}</span> ${title}`;
  section.appendChild(header);
  
  const list = document.createElement('ul');
  list.className = 'section-list';
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  section.appendChild(list);
  
  return section;
}

function createHighlightsSection(highlights) {
  const section = document.createElement('div');
  section.className = 'summary-section highlights';

  const header = document.createElement('h3');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-icon">${ICONS.highlights}</span> Highlights`;
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'highlights-list';

  highlights.forEach(highlight => {
    const item = document.createElement('div');
    item.className = 'highlight-item';

    const reasonBadge = document.createElement('span');
    reasonBadge.className = 'highlight-reason';
    reasonBadge.textContent = highlight.reason || 'Important';

    const meta = document.createElement('div');
    meta.className = 'highlight-meta';
    meta.textContent = `${highlight.sender || 'Unknown'} • ${formatTimestamp(highlight.timestamp)}`;

    const message = document.createElement('div');
    message.className = 'highlight-message';
    message.textContent = highlight.message || '';

    item.appendChild(reasonBadge);
    item.appendChild(meta);
    item.appendChild(message);
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return timestamp;
  }
}

function createLinksSection(links) {
  const section = document.createElement('div');
  section.className = 'summary-section links';
  
  const header = document.createElement('h3');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-icon">${ICONS.links}</span> Links`;
  section.appendChild(header);
  
  const list = document.createElement('ul');
  list.className = 'section-list links-list';
  links.forEach(link => {
    const li = document.createElement('li');
    const contextSpan = document.createElement('span');
    contextSpan.className = 'link-context';
    contextSpan.textContent = link.context;
    
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = link.url;
    
    li.appendChild(contextSpan);
    li.appendChild(document.createTextNode(' - '));
    li.appendChild(anchor);
    list.appendChild(li);
  });
  section.appendChild(list);
  
  return section;
}

function createContextWarning(contextStatus, onExpandContext) {
  const warning = document.createElement('div');
  warning.className = 'context-warning';
  
  const text = document.createElement('div');
  text.className = 'warning-text';
  text.innerHTML = `<span class="warning-icon">${ICONS.warning}</span> <strong>Incomplete context:</strong> ${escapeHtml(contextStatus.reason)}`;
  warning.appendChild(text);
  
  if (onExpandContext && contextStatus.suggestion) {
    const button = document.createElement('button');
    button.className = 'expand-context-btn';
    button.innerHTML = `${ICONS.expand} Load more messages`;
    button.addEventListener('click', onExpandContext);
    warning.appendChild(button);
  }
  
  return warning;
}

function renderRawSummary(rawText, container) {
  const section = document.createElement('div');
  section.className = 'summary-section raw-summary';
  section.innerHTML = rawText.replace(/\n/g, '<br>');
  container.appendChild(section);
}

function formatPeriod(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  const timeOpts = { hour: '2-digit', minute: '2-digit' };
  const dateOpts = { month: 'short', day: 'numeric' };
  
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${startDate.toLocaleDateString(undefined, dateOpts)} ${startDate.toLocaleTimeString(undefined, timeOpts)} - ${endDate.toLocaleTimeString(undefined, timeOpts)}`;
  }
  
  return `${startDate.toLocaleDateString(undefined, dateOpts)} - ${endDate.toLocaleDateString(undefined, dateOpts)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getSummaryAsText(result) {
  if (!result) return '';
  
  let text = '';
  
  if (result.metadata) {
    if (result.metadata.period?.start && result.metadata.period?.end) {
      text += `Period: ${formatPeriod(result.metadata.period.start, result.metadata.period.end)}\n`;
    }
    text += `Messages: ${result.metadata.messageCount}\n\n`;
  }
  
  if (result.success && result.data) {
    text += `TL;DR:\n${result.data.tldr}\n\n`;
    text += `Key Points:\n${result.data.keyPoints.map(p => `• ${p}`).join('\n')}\n`;

    if (result.data.highlights?.length) {
      text += `\nHighlights:\n`;
      result.data.highlights.forEach(h => {
        text += `\n⭐ ${h.reason || 'Important'}\n`;
        text += `   ${h.sender || 'Unknown'} • ${h.timestamp || ''}\n`;
        text += `   "${h.message || ''}"\n`;
      });
    }

    if (result.data.links?.length) {
      text += `\nLinks:\n${result.data.links.map(l => `• ${l.context}: ${l.url}`).join('\n')}`;
    }
  } else if (result.rawText) {
    text += result.rawText;
  }
  
  return text;
}
