import {
  Boxes,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Network as NetworkIcon,
  Settings,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "../components/logo.js";
import { Select } from "../components/select.js";
import { LANGUAGES, type Language, setLanguage } from "../i18n/index.js";
import { type ThemeChoice, useTheme } from "../theme/theme-store.js";
import { api } from "./api.js";
import { keys, useEngine, useSession } from "./queries.js";
import { useApiMutation } from "./use-api-mutation.js";
import { useEngineEvents } from "./use-engine-events.js";

const NAV = [
  { to: "/", key: "nav.topology", icon: Workflow },
  { to: "/containers", key: "nav.containers", icon: Boxes },
  { to: "/images", key: "nav.images", icon: ImageIcon },
  { to: "/volumes", key: "nav.volumes", icon: HardDrive },
  { to: "/networks", key: "nav.networks", icon: NetworkIcon },
  { to: "/settings", key: "nav.settings", icon: Settings, adminOnly: true },
] as const;

const THEMES: ThemeChoice[] = ["system", "dark", "light"];

export function Shell() {
  const { t, i18n } = useTranslation();
  useEngineEvents();
  const { data: engine } = useEngine();
  const { data: session } = useSession();
  const theme = useTheme();
  const logout = useApiMutation(() => api.logout(), [keys.session]);

  const status = !engine?.connected
    ? { color: "bg-danger", text: t("engine.disconnected") }
    : engine.engine === "fake"
      ? { color: "bg-amber", text: t("engine.demo") }
      : { color: "bg-ok", text: t("engine.connected") };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg1 px-4">
        <Logo />
        <nav className="flex gap-1" aria-label="Main">
          {NAV.filter((n) => !("adminOnly" in n && n.adminOnly) || session?.role === "admin").map(
            ({ to, key, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${isActive ? "bg-accent-soft text-accent" : "text-dim hover:text-fg"}`
                }
              >
                <Icon size={15} /> {t(key)}
              </NavLink>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-dim">
          <span
            className="flex items-center gap-2"
            title={
              engine
                ? t("engine.summary", {
                    running: engine.running,
                    containers: engine.containers,
                    images: engine.images,
                  })
                : ""
            }
          >
            <span className={`h-2 w-2 rounded-full ${status.color}`} aria-hidden="true" />
            {status.text}
          </span>
          <Select
            label={t("theme.label")}
            value={theme.choice}
            onChange={(v) => theme.set(v as ThemeChoice)}
            options={THEMES.map((v) => ({ value: v, text: t(`theme.${v}`) }))}
          />
          <Select
            label={t("language.label")}
            value={i18n.language}
            onChange={(v) => setLanguage(v as Language)}
            options={LANGUAGES.map((v) => ({ value: v, text: v.toUpperCase() }))}
          />
          <span className="font-mono">{session?.username}</span>
          <button
            type="button"
            aria-label={t("auth.logout")}
            title={t("auth.logout")}
            className="hover:text-fg"
            onClick={() => logout.mutate(undefined)}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
