import type { AdfDocument, AdfMark, AdfNode } from './types.js';

// ─── ADF → Markdown ─────────────────────────────────────────────────────────

export function adfToMarkdown(doc: AdfDocument | null): string {
  if (doc === null) {
    return '';
  }
  return convertNodes(doc.content).trim();
}

interface ListContext {
  listType: 'bullet' | 'ordered';
  listIndex: number;
}

function convertNodes(nodes: AdfNode[], context?: ListContext): string {
  return nodes.map((node) => convertNode(node, context)).join('');
}

function convertNode(node: AdfNode, context?: ListContext): string {
  switch (node.type) {
    case 'paragraph':
      return `${convertInlineContent(node.content ?? [])}\n\n`;

    case 'heading': {
      const level = typeof node.attrs?.['level'] === 'number' ? node.attrs['level'] : 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${convertInlineContent(node.content ?? [])}\n\n`;
    }

    case 'bulletList':
      return `${(node.content ?? []).map((item) => convertNode(item, { listType: 'bullet', listIndex: 0 })).join('')}\n`;

    case 'orderedList':
      return `${(node.content ?? []).map((item, i) => convertNode(item, { listType: 'ordered', listIndex: i + 1 })).join('')}\n`;

    case 'listItem': {
      const prefix = context?.listType === 'ordered' ? `${String(context.listIndex)}. ` : '- ';
      const inner = (node.content ?? [])
        .flatMap((child) => (child.type === 'paragraph' ? (child.content ?? []) : [child]))
        .map((child) => convertInlineContent([child]))
        .join('');
      return `${prefix}${inner}\n`;
    }

    case 'codeBlock': {
      const lang = typeof node.attrs?.['language'] === 'string' ? node.attrs['language'] : '';
      const code = (node.content ?? []).map((c) => c.text ?? '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case 'blockquote': {
      const content = convertNodes(node.content ?? []);
      const quoted = content
        .split('\n')
        .map((line) => (line.length > 0 ? `> ${line}` : '>'))
        .join('\n');
      return `${quoted}\n`;
    }

    case 'rule':
      return '---\n\n';

    case 'table':
      return `${convertTable(node)}\n`;

    case 'panel': {
      const panelType =
        typeof node.attrs?.['panelType'] === 'string' ? node.attrs['panelType'] : 'info';
      const content = convertNodes(node.content ?? []);
      return `> **${panelType.toUpperCase()}:** ${content.trim()}\n\n`;
    }

    case 'expand': {
      const title = typeof node.attrs?.['title'] === 'string' ? node.attrs['title'] : 'Details';
      const content = convertNodes(node.content ?? []);
      return `<details>\n<summary>${title}</summary>\n\n${content}\n</details>\n\n`;
    }

    case 'hardBreak':
      return '\n';

    case 'text':
      return applyMarks(node.text ?? '', node.marks ?? []);

    case 'mention': {
      const id = typeof node.attrs?.['id'] === 'string' ? node.attrs['id'] : '';
      const rawText = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
      const displayName = rawText.replace(/^@/, '');
      if (id === '') {
        return displayName === '' ? '@unknown' : `@${displayName}`;
      }
      return displayName === '' ? `@[${id}]` : `@[${displayName}|${id}]`;
    }

    case 'emoji': {
      const shortName =
        typeof node.attrs?.['shortName'] === 'string' ? node.attrs['shortName'] : '';
      return shortName;
    }

    case 'inlineCard': {
      const url = typeof node.attrs?.['url'] === 'string' ? node.attrs['url'] : '';
      return url;
    }

    case 'date': {
      const timestamp =
        typeof node.attrs?.['timestamp'] === 'string' ? node.attrs['timestamp'] : undefined;
      if (timestamp === undefined) {
        return '';
      }
      return new Date(parseInt(timestamp, 10)).toISOString().split('T')[0] ?? '';
    }

    case 'status': {
      const statusText = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
      return `[${statusText}]`;
    }

    case 'mediaSingle':
    case 'mediaGroup':
      return convertMediaNodes(node.content ?? []);

    default:
      if (node.content !== undefined) {
        return convertNodes(node.content);
      }
      return '';
  }
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff']);

function isImageFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function convertMediaNodes(nodes: AdfNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'media') {
      const id = typeof node.attrs?.['id'] === 'string' ? node.attrs['id'] : undefined;
      const mediaType = typeof node.attrs?.['type'] === 'string' ? node.attrs['type'] : 'file';
      const filename =
        typeof node.attrs?.['alt'] === 'string'
          ? node.attrs['alt']
          : typeof node.attrs?.['__fileName'] === 'string'
            ? node.attrs['__fileName']
            : '';

      if (
        id !== undefined &&
        mediaType === 'file' &&
        (filename === '' || isImageFilename(filename))
      ) {
        parts.push(`[image: id=${id}${filename !== '' ? `, filename=${filename}` : ''}]`);
      } else {
        parts.push('[media]');
      }
    }
  }
  return parts.length > 0 ? `${parts.join('\n')}\n\n` : '[media]\n\n';
}

function convertInlineContent(nodes: AdfNode[]): string {
  return nodes.map((node) => convertNode(node)).join('');
}

function applyMarks(text: string, marks: AdfMark[]): string {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        result = `**${result}**`;
        break;
      case 'em':
        result = `*${result}*`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'link': {
        const href = typeof mark.attrs?.['href'] === 'string' ? mark.attrs['href'] : '';
        result = `[${result}](${href})`;
        break;
      }
      default:
        break;
    }
  }
  return result;
}

function convertTable(node: AdfNode): string {
  const rows = node.content ?? [];
  if (rows.length === 0) {
    return '';
  }

  const tableData = rows.map((row) =>
    (row.content ?? []).map((cell) => convertNodes(cell.content ?? []).trim()),
  );

  const firstRow = tableData[0];
  if (firstRow === undefined) {
    return '';
  }

  const header = `| ${firstRow.join(' | ')} |`;
  const separator = `| ${firstRow.map(() => '---').join(' | ')} |`;
  const body = tableData
    .slice(1)
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');

  return `${header}\n${separator}\n${body}\n`;
}

// ─── Markdown → ADF ─────────────────────────────────────────────────────────

export function markdownToAdf(markdown: string): AdfDocument {
  const lines = markdown.split('\n');
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const codeLine = lines[i];
        if (codeLine === undefined || codeLine.startsWith('```')) {
          break;
        }
        codeLines.push(codeLine);
        i++;
      }
      i++; // skip closing ```
      const attrs: Record<string, unknown> = {};
      if (lang.length > 0) {
        attrs['language'] = lang;
      }
      content.push({
        type: 'codeBlock',
        attrs,
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)/.exec(line);
    if (headingMatch !== null) {
      const hashes = headingMatch[1];
      const headingText = headingMatch[2];
      if (hashes !== undefined && headingText !== undefined) {
        content.push({
          type: 'heading',
          attrs: { level: hashes.length },
          content: parseInlineContent(headingText),
        });
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const quoteLine = lines[i];
        if (!quoteLine?.startsWith('>')) {
          break;
        }
        quoteLines.push(quoteLine.replace(/^>\s?/, ''));
        i++;
      }
      content.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: parseInlineContent(quoteLines.join('\n')),
          },
        ],
      });
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined || !/^\s*[-*+]\s/.test(itemLine)) {
          break;
        }
        const itemText = itemLine.replace(/^\s*[-*+]\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineContent(itemText) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined || !/^\s*\d+\.\s/.test(itemLine)) {
          break;
        }
        const itemText = itemLine.replace(/^\s*\d+\.\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineContent(itemText) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const paraLine = lines[i];
      if (
        paraLine === undefined ||
        paraLine.trim() === '' ||
        paraLine.startsWith('#') ||
        paraLine.startsWith('```') ||
        paraLine.startsWith('>') ||
        /^\s*[-*+]\s/.test(paraLine) ||
        /^\s*\d+\.\s/.test(paraLine)
      ) {
        break;
      }
      paraLines.push(paraLine);
      i++;
    }
    if (paraLines.length > 0) {
      content.push({
        type: 'paragraph',
        content: parseInlineContent(paraLines.join(' ')),
      });
    }
  }

  return { version: 1, type: 'doc', content };
}

function parseInlineContent(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  const regex =
    /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)]\((.+?)\)|~~(.+?)~~|@\[([^\]|]+?)(?:\|([^\]]+?))?\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const bold = match[2];
    const italic = match[3];
    const code = match[4];
    const linkText = match[5];
    const linkHref = match[6];
    const strikethrough = match[7];
    const mentionFirst = match[8];
    const mentionAccountId = match[9];

    if (bold !== undefined) {
      nodes.push({ type: 'text', text: bold, marks: [{ type: 'strong' }] });
    } else if (italic !== undefined) {
      nodes.push({ type: 'text', text: italic, marks: [{ type: 'em' }] });
    } else if (code !== undefined) {
      nodes.push({ type: 'text', text: code, marks: [{ type: 'code' }] });
    } else if (linkText !== undefined && linkHref !== undefined) {
      nodes.push({
        type: 'text',
        text: linkText,
        marks: [{ type: 'link', attrs: { href: linkHref } }],
      });
    } else if (strikethrough !== undefined) {
      nodes.push({ type: 'text', text: strikethrough, marks: [{ type: 'strike' }] });
    } else if (mentionFirst !== undefined) {
      // Mention syntax: @[accountId] or @[Display Name|accountId]
      const accountId = mentionAccountId ?? mentionFirst;
      nodes.push({
        type: 'mention',
        attrs: { id: accountId, text: `@${mentionFirst}` },
      });
    }

    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  if (nodes.length === 0) {
    nodes.push({ type: 'text', text });
  }

  return nodes;
}
