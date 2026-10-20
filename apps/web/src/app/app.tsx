import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "../components/ui.js";
import { AuthPage } from "../features/auth/auth-page.js";
import { ComposeProjectsPage } from "../features/compose/compose-projects-page.js";
import { ContainerPage } from "../features/containers/container-page.js";
import { ContainersPage } from "../features/resources/containers-page.js";
import { ImagesPage } from "../features/resources/images-page.js";
import { NetworksPage } from "../features/resources/networks-page.js";
import { VolumesPage } from "../features/resources/volumes-page.js";
import { SettingsPage } from "../features/settings/settings-page.js";
import { useSession } from "./queries.js";
import { Shell } from "./shell.js";

const ComposeEditorPage = lazy(() =>
  import("../features/compose/compose-editor-page.js").then((m) => ({
    default: m.ComposeEditorPage,
  })),
);
const TerminalPage = lazy(() =>
  import("../features/terminal/terminal-page.js").then((m) => ({ default: m.TerminalPage })),
);
const TopologyPage = lazy(() =>
  import("../features/topology/topology-page.js").then((m) => ({ default: m.TopologyPage })),
);

export function App() {
  const { t } = useTranslation();
  const { data: session, isLoading } = useSession();

  return (
    <>
      {isLoading || !session ? (
        <p className="p-8 text-dim">{t("common.loading")}</p>
      ) : !session.authenticated ? (
        <AuthPage session={session} />
      ) : (
        <Routes>
          <Route element={<Shell />}>
            <Route
              index
              element={
                <Suspense fallback={null}>
                  <TopologyPage />
                </Suspense>
              }
            />
            <Route path="containers" element={<ContainersPage />} />
            <Route path="containers/:id" element={<ContainerPage />} />
            <Route
              path="terminal/:id"
              element={
                <Suspense fallback={null}>
                  <TerminalPage />
                </Suspense>
              }
            />
            <Route path="images" element={<ImagesPage />} />
            <Route path="volumes" element={<VolumesPage />} />
            <Route path="networks" element={<NetworksPage />} />
            <Route path="compose" element={<ComposeProjectsPage />} />
            <Route
              path="compose/:name"
              element={
                <Suspense fallback={null}>
                  <ComposeEditorPage />
                </Suspense>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      <Toaster />
    </>
  );
}
