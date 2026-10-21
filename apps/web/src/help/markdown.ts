/**
 * The small Markdown subset the help topics use: headings, paragraphs, lists, tables, fenced code,
 * notes (`>`), images and inline code, bold and links. Pure, so it is unit-tested; the topics are
 * our own files, but nothing here ever produces HTML, so there is nothing to sanitize.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "note"; inline: Inline[] }
  | { kind: "image"; name: string; alt: string };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export const parseInline = (source: string): Inline[] => {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else out.push({ kind: "link", text: m[3] ?? "", href: m[4] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out;
};

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isDivider = (line: string): boolean =>
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line);
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+\.\s+(.*)$/;
const IMAGE = /^!\[([^\]]*)\]\(img:([\w-]+)\)\s*$/;

export const parseMarkdown = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      i++;
      blocks.push({ kind: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
        text: heading[2] ?? "",
      });
      i++;
      continue;
    }
    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ kind: "image", alt: image[1] ?? "", name: image[2] ?? "" });
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|"))
        rows.push(cells(lines[i++] ?? "").map(parseInline));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">"))
        body.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      blocks.push({ kind: "note", inline: parseInline(body.join(" ")) });
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = pattern.exec(lines[i] ?? "");
        if (item) items.push(parseInline(item[1] ?? ""));
        else if (/^\s{2,}\S/.test(lines[i] ?? "") && items.length > 0) {
          const prev = items.pop() ?? [];
          items.push([...prev, ...parseInline(` ${(lines[i] ?? "").trim()}`)]);
        } else break;
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(```|#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s|!\[)/.test(lines[i] ?? "")
    )
      body.push((lines[i++] ?? "").trim());
    blocks.push({ kind: "paragraph", inline: parseInline(body.join(" ")) });
  }
  return blocks;
};

const inlineText = (parts: Inline[]): string => parts.map((p) => p.text).join("");

const blockText = (b: Block): string => {
  switch (b.kind) {
    case "heading":
    case "code":
      return b.text;
    case "paragraph":
    case "note":
      return inlineText(b.inline);
    case "list":
      return b.items.map(inlineText).join(" ");
    case "table":
      return [...b.head, ...b.rows.flat()].map(inlineText).join(" ");
    case "image":
      return b.alt;
  }
};

/** Plain text of a topic, lower-cased, for the search box. */
export const plainText = (blocks: Block[]): string => blocks.map(blockText).join(" ").toLowerCase();
