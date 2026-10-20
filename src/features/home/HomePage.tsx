import { ArrowRight, ClipboardList, ReceiptText, Settings2, type LucideIcon } from "lucide-react";
import { Card } from "../../components/ui";
import comasaLogo from "../../assets/logo-comasa.png";

function open(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type HomeTile = {
  title: string;
  description: string;
  actionLabel: string;
  path: string;
  icon: LucideIcon;
};

const HOME_TILES: HomeTile[] = [
  {
    title: "Administración",
    description: "Importación diaria, reglas comerciales y seguimiento de promociones.",
    actionLabel: "Abrir administración",
    path: "/administracion",
    icon: Settings2,
  },
  {
    title: "Gestión de cotizaciones",
    description: "Consulta de cotizaciones emitidas por cliente, usuario y segmento.",
    actionLabel: "Abrir cotizaciones",
    path: "/cotizaciones",
    icon: ReceiptText,
  },
  {
    title: "Cotización",
    description: "Evaluación de SKU, cantidades, descuentos y comparación por segmento.",
    actionLabel: "Abrir cotización",
    path: "/cotizacion",
    icon: ClipboardList,
  },
];

export function HomePage() {
  return (
    <div className="home-page">
      <div className="home-head">
        <div className="home-logo-badge">
          <img className="home-logo" src={comasaLogo} alt="COMASA" />
        </div>
        <h1>
          Cotizador Comercial
          <span>Gestión de promociones y cotizaciones por segmento comercial</span>
        </h1>
      </div>

      <div className="home-tiles">
        {HOME_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.path} className="access-card">
              <button
                type="button"
                className="access-card-trigger"
                onClick={() => open(tile.path)}
              >
                <div className="access-card-header">
                  <Icon size={21} strokeWidth={2.1} />
                  <h2>{tile.title}</h2>
                </div>
                <div className="access-card-body">
                  <p>{tile.description}</p>
                  <span className="access-card-link">
                    {tile.actionLabel}
                    <ArrowRight size={16} strokeWidth={2.2} />
                  </span>
                </div>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

