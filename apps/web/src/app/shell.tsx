import { Activity, Boxes, KeyRound, Layers, LogOut, Settings, Workflow } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../components/logo.js";
import { Select } from "../components/select.js";
import { ChangePasswordDialog } from "../features/auth/password-dialogs.js";
import { HelpButton } from "../help/help-button.js";
import { HelpPanel } from "../help/help-panel.js";
import { topicForPath } from "../help/topics.js";
import { LANGUAGES, type Language, setLanguage } from "../i18n/index.js";
import { type ThemeChoice, useTheme } from "../theme/theme-store.js";
import { api } from "./api.js";
import { isActivePath, isResourcePath, RESOURCE_TABS } from "./nav.js";
import { keys, useEngine, useSession } from "./queries.js";
import { useApiMutation } from "./use-api-mutation.js";
import { useEngineEvents } from "./use-engine-events.js";

const NAV = [
  { to: "/", key: "nav.topology", icon: Workflow },
  { to: "/containers", key: "nav.resources", icon: Boxes },
  { to: "/compose", key: "nav.compose", icon: Layers },
  { to: "/system", key: "nav.system", icon: Activity },
] as const;

const THEMES: ThemeChoice[] = ["system", "dark", "light"];

export function Shell() {
  const { t, i18n } = useTranslation();
  useEngineEvents();
  const { data: engine } = useEngine();
  const { data: session } = useSession();
  const theme = useTheme();
  const { pathname } = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  const logout = useApiMutation(() => api.logout(), [keys.session]);

  const status = !engine?.connected
    ? { color: "bg-danger", text: t("engine.disconnected") }
    : engine.engine === "fake"
      ? { color: "bg-amber", text: t("engine.demo") }
      : { color: "bg-ok", text: t("engine.connected") };

  return (
    <div className="flex h-full flex-col">
      <header className="nx-glass nx-lens-wide relative z-20 mx-3 mt-3 flex h-14 shrink-0 items-center gap-4 rounded-full px-5">
        <Logo />
        <nav className="flex gap-1" aria-label="Main">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-current={isActivePath(to, pathname) ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${isActivePath(to, pathname) ? "bg-primary text-primary-fg" : "text-dim hover:text-fg"}`}
            >
              <Icon size={15} /> {t(key)}
              {isActivePath(to, pathname) && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              )}
            </NavLink>
          ))}
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
            aria-label={t("auth.changePassword")}
            title={t("auth.changePassword")}
            className="hover:text-fg"
            onClick={() => setChangingPassword(true)}
          >
            <KeyRound size={16} />
          </button>
          <HelpButton topic={topicForPath(pathname)} size={16} />
          {session?.role === "admin" && (
            <NavLink
              to="/settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              className={({ isActive }) => (isActive ? "text-accent" : "hover:text-fg")}
            >
              <Settings size={16} />
            </NavLink>
          )}
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
      <HelpPanel />
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      {isResourcePath(pathname) && (
        <nav
          className="flex gap-1 border-b border-line bg-bg1 px-4"
          aria-label={t("nav.resources")}
        >
          {RESOURCE_TABS.map(({ to, key }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2 text-sm ${isActive ? "border-accent text-accent" : "border-transparent text-dim hover:text-fg"}`
              }
            >
              {t(key)}
            </NavLink>
          ))}
        </nav>
      )}
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
