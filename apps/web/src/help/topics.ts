import { type Block, parseMarkdown, plainText } from "./markdown.js";

/** Reading order of the help; each id has a file in `content/<language>/<id>.md`. */
export const TOPIC_IDS = [
  "getting-started",
  "topology",
  "volumes",
  "bindings",
  "safe-apply",
  "zone-spec",
  "dns",
  "guards",
  "audit",
  "templates-builds",
  "swarm",
  "cluster",
  "troubleshooting",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export const isTopicId = (value: string): value is TopicId =>
  (TOPIC_IDS as readonly string[]).includes(value);

const SOURCES = import.meta.glob("./content/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Topic {
  id: TopicId;
  title: string;
  blocks: Block[];
  /** Lower-cased text for the search box. */
  haystack: string;
}

const cache = new Map<string, Topic>();

/** The topic in the given language; English when that language has no file for it. */
export const loadTopic = (id: TopicId, language: string): Topic => {
  const lang = language.startsWith("es") ? "es" : "en";
  const key = `${lang}/${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = SOURCES[`./content/${lang}/${id}.md`] ?? SOURCES[`./content/en/${id}.md`] ?? "";
  const blocks = parseMarkdown(source);
  const first = blocks.find((b) => b.kind === "heading");
  const topic: Topic = {
    id,
    title: first?.kind === "heading" ? first.text : id,
    blocks,
    haystack: plainText(blocks),
  };
  cache.set(key, topic);
  return topic;
};

export const searchTopics = (language: string, query: string): Topic[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return TOPIC_IDS.map((id) => loadTopic(id, language)).filter((topic) =>
    words.every((w) => topic.haystack.includes(w) || topic.title.toLowerCase().includes(w)),
  );
};

/** The topic that explains the page the user is on. */
export const topicForPath = (pathname: string): TopicId => {
  if (pathname === "/") return "topology";
  if (pathname.startsWith("/zones")) return "zone-spec";
  if (pathname.startsWith("/dns")) return "dns";
  if (pathname.startsWith("/guard")) return "guards";
  if (pathname.startsWith("/swarm")) return "swarm";
  if (pathname.startsWith("/builds")) return "templates-builds";
  if (pathname.startsWith("/system")) return "troubleshooting";
  return "getting-started";
};
