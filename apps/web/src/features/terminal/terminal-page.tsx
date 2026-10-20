import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ArrowLeft, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useContainers } from "../../app/queries.js";
import { Button } from "../../components/ui.js";
import { LogoBadge } from "../topology/logo-badge.js";

const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const xtermTheme = () => ({
  background: token("--nx-bg-0"),
  foreground: token("--nx-text"),
  cursor: token("--nx-accent"),
  selectionBackground: token("--nx-accent-soft"),
});

export const wsUrl = (id: string, cols: number, rows: number, loc: Location = location): string =>
  `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/ws/terminal/${encodeURIComponent(id)}?cols=${cols}&rows=${rows}`;

export function TerminalPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { data: containers = [] } = useContainers();
  const container = containers.find((c) => c.id === id);
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "closed">("connecting");
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the manual reconnect trigger
  useEffect(() => {
    const el = host.current;
    if (!el || !id) return;
    setState("connecting");
    const term = new Terminal({
      fontFamily: token("--font-mono") || "monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: xtermTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const ws = new WebSocket(wsUrl(id, term.cols, term.rows));
    ws.binaryType = "arraybuffer";
    const encoder = new TextEncoder();
    ws.onopen = () => {
      setState("open");
      term.focus();
    };
    ws.onmessage = (e) => term.write(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = () => setState("closed");
    term.onData((data) => ws.readyState === WebSocket.OPEN && ws.send(encoder.encode(data)));

    const observer = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    });
    observer.observe(el);
    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [id, attempt]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-dim hover:text-fg" aria-label={t("nav.topology")}>
          <ArrowLeft size={18} />
        </Link>
        {container && <LogoBadge image={container.image} name={container.name} size={28} />}
        <h1 className="font-mono text-sm">{container?.name ?? id.slice(0, 12)}</h1>
        <span className="text-xs text-dim">{t(`terminal.${state}`)}</span>
        {state === "closed" && (
          <Button onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw size={14} /> {t("terminal.reconnect")}
          </Button>
        )}
      </div>
      <div
        ref={host}
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-bg0 p-2"
      />
    </div>
  );
}
