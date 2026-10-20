import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "../components/ui.js";
import { AuthPage } from "../features/auth/auth-page.js";
import { ContainersPage } from "../features/resources/containers-page.js";
import { ImagesPage } from "../features/resources/images-page.js";
import { NetworksPage } from "../features/resources/networks-page.js";
import { VolumesPage } from "../features/resources/volumes-page.js";
import { useSession } from "./queries.js";
import { Shell } from "./shell.js";

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
            <Route path="images" element={<ImagesPage />} />
            <Route path="volumes" element={<VolumesPage />} />
            <Route path="networks" element={<NetworksPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      <Toaster />
    </>
  );
}
