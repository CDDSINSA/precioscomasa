import type { NavItem } from "../../constants/navigation";

export function MobileNav({
  currentPath,
  items,
  onNavigate,
}: {
  currentPath: string;
  items: NavItem[];
  onNavigate: (path: string) => void;
}) {
  return (
    <nav className="mobile-nav">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={currentPath === item.path ? "active" : ""}
            key={`${item.path}-${item.label}`}
            onClick={() => onNavigate(item.path)}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
