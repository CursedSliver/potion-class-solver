/**
 * A small, dependency-free Markdown renderer for the project-info dialogs.
 *
 * It covers the CommonMark constructs actually used by `src/info.md` (ATX
 * headings, paragraphs, ordered/unordered lists, fenced code, blockquotes,
 * rules) plus emphasis, inline code, and links. Raw HTML is never executed:
 * text reaches the DOM through `textContent`, and link targets are restricted
 * to http(s)/mailto URLs.
 */

export function renderMarkdown(source: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'markdown';
  appendBlocks(root, source.replace(/\r\n?/g, '\n'));
  return root;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const UNORDERED_RE = /^ {0,3}[-+*][ \t]+(.*)$/;
const ORDERED_RE = /^ {0,3}\d{1,9}[.)][ \t]+(.*)$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;

function appendBlocks(parent: HTMLElement, source: string): void {
  const lines = source.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const markerLength = fence[1].length;
      const body: string[] = [];
      index++;
      while (index < lines.length) {
        const closing = FENCE_RE.exec(lines[index]);
        if (
          closing &&
          closing[1][0] === marker &&
          closing[1].length >= markerLength &&
          !closing[2].trim()
        ) {
          index++;
          break;
        }
        body.push(lines[index]);
        index++;
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = body.join('\n');
      const language = fence[2].trim().split(/\s+/)[0];
      if (language) {
        code.className = `language-${language.replace(/[^\w-]/g, '')}`;
      }
      pre.append(code);
      parent.append(pre);
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2]);
      parent.append(element);
      index++;
      continue;
    }

    if (RULE_RE.test(line)) {
      parent.append(document.createElement('hr'));
      index++;
      continue;
    }

    const unordered = UNORDERED_RE.exec(line);
    const ordered = unordered ? null : ORDERED_RE.exec(line);
    if (unordered || ordered) {
      const orderedList = ordered !== null;
      const itemRe = orderedList ? ORDERED_RE : UNORDERED_RE;
      const list = document.createElement(orderedList ? 'ol' : 'ul');
      while (index < lines.length) {
        const item = itemRe.exec(lines[index]);
        if (!item) {
          break;
        }
        let text = item[1].trim();
        index++;
        // Indented continuation lines belong to the item above.
        while (
          index < lines.length &&
          lines[index].trim() &&
          !isBlockStart(lines[index]) &&
          /^ {2,}/.test(lines[index])
        ) {
          text += ` ${lines[index].trim()}`;
          index++;
        }
        const listItem = document.createElement('li');
        appendInline(listItem, text);
        list.append(listItem);
        // Skip the blank line between items, but only if another item follows.
        if (index < lines.length && !lines[index].trim()) {
          const next = lines[index + 1];
          if (next !== undefined && itemRe.test(next)) {
            index++;
          } else {
            break;
          }
        }
      }
      parent.append(list);
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const quotedLine = QUOTE_RE.exec(lines[index]);
        if (!quotedLine) {
          break;
        }
        quoted.push(quotedLine[1]);
        index++;
      }
      const blockquote = document.createElement('blockquote');
      appendBlocks(blockquote, quoted.join('\n'));
      parent.append(blockquote);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index++;
    }
    const element = document.createElement('p');
    appendInline(element, paragraph.join(' '));
    parent.append(element);
  }
}

function isBlockStart(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    RULE_RE.test(line) ||
    UNORDERED_RE.test(line) ||
    ORDERED_RE.test(line) ||
    QUOTE_RE.test(line)
  );
}

interface ParsedLink {
  label: string;
  url: string;
  end: number;
}

function appendInline(parent: Node, source: string): void {
  let buffer = '';
  const flush = (): void => {
    if (buffer) {
      parent.appendChild(document.createTextNode(buffer));
      buffer = '';
    }
  };

  let index = 0;
  while (index < source.length) {
    const character = source[index];

    if (
      character === '\\' &&
      index + 1 < source.length &&
      /[\\`*_{}[\]()#+\-.!>~|]/.test(source[index + 1])
    ) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    if (character === '`') {
      const run = /^`+/.exec(source.slice(index))?.[0] ?? '`';
      const close = source.indexOf(run, index + run.length);
      if (close !== -1) {
        flush();
        const code = document.createElement('code');
        code.textContent = source.slice(index + run.length, close);
        parent.appendChild(code);
        index = close + run.length;
        continue;
      }
    }

    if (character === '[') {
      const link = matchLink(source, index);
      if (link) {
        flush();
        parent.appendChild(makeLink(link));
        index = link.end;
        continue;
      }
    }

    if (character === '<') {
      const autolink = /^<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/.exec(source.slice(index));
      if (autolink) {
        flush();
        parent.appendChild(
          makeLink({
            label: autolink[1],
            url: autolink[1],
            end: index + autolink[0].length,
          }),
        );
        index += autolink[0].length;
        continue;
      }
    }

    if (character === '*' || character === '_') {
      const strongMarker = character.repeat(2);
      if (source.startsWith(strongMarker, index)) {
        const close = findEmphasisClose(source, index + 2, strongMarker);
        if (close !== -1) {
          flush();
          const strong = document.createElement('strong');
          appendInline(strong, source.slice(index + 2, close));
          parent.appendChild(strong);
          index = close + strongMarker.length;
          continue;
        }
      }
      const close = findEmphasisClose(source, index + 1, character);
      const intraWord =
        character === '_' && isWordCharacter(source[index - 1]) && isWordCharacter(source[index + 1]);
      if (close !== -1 && !intraWord) {
        flush();
        const emphasis = document.createElement('em');
        appendInline(emphasis, source.slice(index + 1, close));
        parent.appendChild(emphasis);
        index = close + 1;
        continue;
      }
    }

    buffer += character;
    index++;
  }
  flush();
}

/** Finds the next closing emphasis marker, skipping escaped markers. */
function findEmphasisClose(source: string, from: number, marker: string): number {
  let index = from;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source.startsWith(marker, index)) {
      const content = source.slice(from, index);
      if (content.trim() !== '' && !/\s$/.test(content)) {
        return index;
      }
    }
    index++;
  }
  return -1;
}

function matchLink(source: string, start: number): ParsedLink | null {
  let depth = 0;
  let index = start;
  for (; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      index++;
      continue;
    }
    if (character === '[') {
      depth++;
    } else if (character === ']') {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }
  if (depth !== 0 || source[index] !== ']' || source[index + 1] !== '(') {
    return null;
  }
  const label = source.slice(start + 1, index);
  let cursor = index + 2;
  let parentheses = 1;
  for (; cursor < source.length; cursor++) {
    const character = source[cursor];
    if (character === '\\') {
      cursor++;
      continue;
    }
    if (character === '(') {
      parentheses++;
    } else if (character === ')') {
      parentheses--;
      if (parentheses === 0) {
        break;
      }
    }
  }
  if (parentheses !== 0) {
    return null;
  }
  return {
    label,
    url: source.slice(index + 2, cursor).trim(),
    end: cursor + 1,
  };
}

function makeLink(link: ParsedLink): Node {
  const href = sanitizeUrl(link.url);
  if (!href) {
    const span = document.createElement('span');
    span.textContent = link.label;
    return span;
  }
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  appendInline(anchor, link.label);
  return anchor;
}

function sanitizeUrl(raw: string): string | null {
  const value = raw.trim().replace(/^<|>$/g, '');
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}
