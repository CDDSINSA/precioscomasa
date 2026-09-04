import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { navigation } from "../../constants/navigation";
import { SystemStatusIndicator } from "../../components/SystemStatusIndicator";
import { signOut } from "../../services/auth";
import type { AppProfile } from "../../types/domain";
import comasaLogo from "../../assets/logo-comasa.png";
import { MobileNav } from "./MobileNav";

export function AppShell({
  children,
  currentPath,
  profile,
}: {
  children: ReactNode;
  currentPath: string;
  profile: AppProfile;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const allowed = useMemo(() => navigation.filter((item) => item.roles.includes(profile.role)), [profile.role]);

  function navigate(path: string) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src={comasaLogo} alt="COMASA" />
          <div className="brand-copy">
            <strong>COMASA</strong>
            <span>Cotizador comercial</span>
          </div>
          <button className="icon-btn" title="Contraer menú" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        <div className="user-panel">
          <span>{profile.email}</span>
          <strong>{profile.fullName}</strong>
          <small>{profile.role}</small>
        </div>

        <nav>
          {allowed.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={currentPath === item.path ? "active" : ""}
                key={`${item.path}-${item.label}`}
                onClick={() => navigate(item.path)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="logout-btn" onClick={signOut}>
          <LogOut size={17} />
          <span>Cerrar sesión</span>
        </button>
      </aside>
      <main>
        <SystemStatusIndicator />
        {children}
      </main>
      <MobileNav currentPath={currentPath} items={allowed.slice(0, 4)} onNavigate={navigate} onSignOut={signOut} />
    </div>
  );
}
