import { useEffect, useState } from "react";
import { AppShell } from "./app/shell/AppShell";
import {
  defaultPathForRole,
  getProfile,
  getSession,
  isPasswordRecoveryUrl,
  onAuthChange,
  signOut,
} from "./services/auth";
import { AccessPendingPage, AuthPage, PasswordRecoveryPage } from "./features/auth/AuthPage";
import { AdminPage } from "./features/admin/AdminPage";
import { HomePage } from "./features/home/HomePage";
import { QuotePage } from "./features/quotes/QuotePage";
import { navigation } from "./constants/navigation";
import type { AppProfile } from "./types/domain";

const routes = {
  "/": <HomePage />,
  "/administracion": <AdminPage />,
  "/cotizacion": <QuotePage />,
};

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(isPasswordRecoveryUrl());
  const [loading, setLoading] = useState(true);

  const allowedPaths = profile
    ? navigation.filter((item) => item.roles.includes(profile.role)).map((item) => item.path)
    : [];
  const safePath = profile && allowedPaths.includes(path) ? path : profile ? defaultPathForRole(profile.role) : path;
  const page = routes[safePath as keyof typeof routes] ?? <QuotePage />;

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  useEffect(() => {
    async function hydrate() {
      const session = await getSession();
      setAuthenticated(Boolean(session));
      setProfile(await getProfile(session));
      setLoading(false);
    }

    hydrate();
    return onAuthChange(async (session, event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      setAuthenticated(Boolean(session));
      setProfile(await getProfile(session));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (profile && safePath !== path) {
      window.history.replaceState(null, "", safePath);
      setPath(safePath);
    }
  }, [path, profile, safePath]);

  if (loading) return <div className="app-loading">Cargando sesion...</div>;
  if (recoveringPassword) return <PasswordRecoveryPage onDone={() => setRecoveringPassword(false)} />;
  if (!authenticated) return <AuthPage />;
  if (!profile) return <AccessPendingPage onSignOut={signOut} />;

  return <AppShell currentPath={safePath} profile={profile}>{page}</AppShell>;
}
