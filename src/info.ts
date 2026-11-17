import infoMarkdown from './info.md';

export interface InfoSection {
  /** The section heading text, used as the button and prompt title. */
  readonly title: string;
  /** The section body exactly as written in `src/info.md` (minus the heading line). */
  readonly markdown: string;
}

/**
 * Splits the project info Markdown into its level-2 sections. The heading line
 * becomes the section title; every following line up to the next level-2
 * heading becomes its body. Fenced code blocks are skipped when looking for
 * headings so a `##` inside code cannot create a button.
 */
export function parseInfoSections(source: string): InfoSection[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
    }

    const heading = fence === null ? /^##[ \t]+(.+?)[ \t]*$/.exec(line) : null;
    if (heading) {
      current = { title: heading[1], body: [] };
      sections.push(current);
      continue;
    }
    current?.body.push(line);
  }

  return sections.map(section => ({
    title: section.title,
    markdown: section.body.join('\n').trim(),
  }));
}

export const INFO_SECTIONS: readonly InfoSection[] = parseInfoSections(infoMarkdown);
