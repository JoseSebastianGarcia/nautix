import { resolveTheme } from "../theme/resolve-theme.js";
import { useTheme } from "../theme/theme-store.js";
import { useHelp } from "./help-store.js";
import type { Block, Inline } from "./markdown.js";
import { isTopicId } from "./topics.js";

function InlineView({ parts }: { parts: Inline[] }) {
  const show = useHelp((s) => s.show);
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p.text}`;
        if (p.kind === "code")
          return (
            <code key={key} className="rounded bg-bg2 px-1 py-0.5 font-mono text-[0.85em]">
              {p.text}
            </code>
          );
        if (p.kind === "bold") return <strong key={key}>{p.text}</strong>;
        if (p.kind === "link") {
          if (p.href.startsWith("help:")) {
            const id = p.href.slice("help:".length);
            if (isTopicId(id))
              return (
                <button
                  key={key}
                  type="button"
                  className="text-accent underline"
                  onClick={() => show(id)}
                >
                  {p.text}
                </button>
              );
          } else if (/^https:\/\//.test(p.href))
            return (
              <a
                key={key}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                {p.text}
              </a>
            );
          return <span key={key}>{p.text}</span>;
        }
        return <span key={key}>{p.text}</span>;
      })}
    </>
  );
}

/** Screenshots come in a dark and a light version (`name-dark.png`, `name-light.png`). */
function Screenshot({ name, alt }: { name: string; alt: string }) {
  const choice = useTheme((s) => s.choice);
  const theme = resolveTheme(choice, matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <img
      src={`/help/${name}-${theme}.png`}
      alt={alt}
      loading="lazy"
      className="w-full rounded-lg border border-line"
    />
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? (
        <h2 className="text-lg font-semibold">{block.text}</h2>
      ) : (
        <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-dim">
          {block.text}
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed">
          <InlineView parts={block.inline} />
        </p>
      );
    case "note":
      return (
        <p className="rounded-lg border border-line bg-accent-soft p-3 text-sm">
          <InlineView parts={block.inline} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`flex flex-col gap-1 pl-5 text-sm ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item) => (
            <li key={item.map((p) => p.text).join("")}>
              <InlineView parts={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-line bg-bg0 p-3 font-mono text-xs">
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th
                    key={cell.map((p) => p.text).join("")}
                    className="border-b border-line px-2 py-1 font-medium text-dim"
                  >
                    <InlineView parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.map((c) => c.map((p) => p.text).join("")).join("|")}>
                  {row.map((cell) => (
                    <td
                      key={cell.map((p) => p.text).join("")}
                      className="border-b border-line px-2 py-1 align-top"
                    >
                      <InlineView parts={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return <Screenshot name={block.name} alt={block.alt} />;
  }
}

export function MarkdownView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks are static and never reorder
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
