import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Block, parseInline, parseMarkdown } from "./markdown.js";
import { isTopicId, loadTopic, searchTopics, TOPIC_IDS, topicForPath } from "./topics.js";

const contentDir = (lang: string): string =>
  new URL(`./content/${lang}/`, import.meta.url).pathname;
const publicHelp = new URL("../../public/help/", import.meta.url).pathname;

const inlineLinks = (blocks: Block[]): string[] => {
  const parts = blocks.flatMap((b) => {
    switch (b.kind) {
      case "paragraph":
      case "note":
        return b.inline;
      case "list":
        return b.items.flat();
      case "table":
        return [...b.head, ...b.rows.flat()].flat();
      default:
        return [];
    }
  });
  return parts.flatMap((p) => (p.kind === "link" ? [p.href] : []));
};

describe("parseInline", () => {
  it("splits code, bold and links from text", () => {
    expect(parseInline("a `b` **c** [d](help:dns) e")).toEqual([
      { kind: "text", text: "a " },
      { kind: "code", text: "b" },
      { kind: "text", text: " " },
      { kind: "bold", text: "c" },
      { kind: "text", text: " " },
      { kind: "link", text: "d", href: "help:dns" },
      { kind: "text", text: " e" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings, lists, tables, code, notes and images", () => {
    const blocks = parseMarkdown(
      [
        "# Title",
        "",
        "text on",
        "two lines",
        "",
        "1. one",
        "2. two",
        "",
        "- a",
        "- b",
        "",
        "| x | y |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "```yaml",
        "k: v",
        "```",
        "",
        "> careful",
        "",
        "![alt](img:shot)",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "table",
      "code",
      "note",
      "image",
    ]);
    expect(blocks[1]).toMatchObject({ inline: [{ kind: "text", text: "text on two lines" }] });
    expect(blocks[2]).toMatchObject({ ordered: true });
    expect(blocks[5]).toMatchObject({ lang: "yaml", text: "k: v" });
    expect(blocks[7]).toEqual({ kind: "image", alt: "alt", name: "shot" });
  });

  it("keeps a code block verbatim, even when it looks like markdown", () => {
    const [block] = parseMarkdown("```\n# not a heading\n- not a list\n```");
    expect(block).toEqual({ kind: "code", lang: "", text: "# not a heading\n- not a list" });
  });
});

describe("help topics", () => {
  for (const lang of ["en", "es"]) {
    it(`${lang} has exactly the listed topics`, () => {
      const files = readdirSync(contentDir(lang))
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
      expect(files).toEqual([...TOPIC_IDS].sort());
    });
  }

  it("every topic starts with a title and has the same screenshots in both languages", () => {
    for (const id of TOPIC_IDS) {
      const en = loadTopic(id, "en");
      const es = loadTopic(id, "es");
      expect(en.blocks[0]?.kind, `en/${id}`).toBe("heading");
      expect(es.blocks[0]?.kind, `es/${id}`).toBe("heading");
      const shots = (t: typeof en): string[] =>
        t.blocks.flatMap((b) => (b.kind === "image" ? [b.name] : []));
      expect(shots(es), id).toEqual(shots(en));
    }
  });

  it("links point to topics or https addresses", () => {
    for (const lang of ["en", "es"])
      for (const id of TOPIC_IDS)
        for (const href of inlineLinks(loadTopic(id, lang).blocks)) {
          const ok = href.startsWith("help:")
            ? isTopicId(href.slice("help:".length))
            : href.startsWith("https://");
          expect(ok, `${lang}/${id}: ${href}`).toBe(true);
        }
  });

  it("every screenshot exists in a dark and a light version", () => {
    const names = new Set(
      TOPIC_IDS.flatMap((id) =>
        loadTopic(id, "en").blocks.flatMap((b) => (b.kind === "image" ? [b.name] : [])),
      ),
    );
    for (const name of names)
      for (const theme of ["dark", "light"])
        expect(existsSync(`${publicHelp}${name}-${theme}.png`), `${name}-${theme}.png`).toBe(true);
  });

  it("falls back to English when a language has no file", () => {
    expect(loadTopic("dns", "fr").title).toBe(loadTopic("dns", "en").title);
  });

  it("searches titles and bodies in the language asked", () => {
    expect(searchTopics("en", "iptables").map((t) => t.id)).toContain("guards");
    expect(searchTopics("es", "hash del plan").map((t) => t.id)).toContain("zone-spec");
    expect(searchTopics("en", "zzzz-nothing")).toEqual([]);
  });

  it("maps pages to the topic that explains them", () => {
    expect(topicForPath("/")).toBe("topology");
    expect(topicForPath("/zones/shop")).toBe("zone-spec");
    expect(topicForPath("/dns")).toBe("dns");
    expect(topicForPath("/guard")).toBe("guards");
    expect(topicForPath("/swarm")).toBe("swarm");
    expect(topicForPath("/builds")).toBe("templates-builds");
    expect(topicForPath("/containers/abc")).toBe("getting-started");
  });
});
