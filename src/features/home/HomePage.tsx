import { ClipboardList, Settings2 } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import comasaLogo from "../../assets/logo-comasa.png";

function open(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function HomePage() {
  return (
    <div className="home-page">
      <div className="home-head">
        <h1>Cotizador Comercial</h1>
        <div className="home-brand-line">
          <img className="home-logo" src={comasaLogo} alt="COMASA" />
          <span>COMASA</span>
        </div>
        <p>Gestión de promociones y cotizaciones por segmento comercial.</p>
      </div>

      <div className="home-tiles">
        <Card className="access-card">
          <CardContent>
            <div className="access-icon">
              <Settings2 size={28} />
            </div>
            <h2>Administración</h2>
            <p>Importación diaria, reglas comerciales y seguimiento de promociones.</p>
            <Button onClick={() => open("/administracion")}>
              <Settings2 size={17} />
              Entrar
            </Button>
          </CardContent>
        </Card>

        <Card className="access-card">
          <CardContent>
            <div className="access-icon cyan">
              <ClipboardList size={28} />
            </div>
            <h2>Cotización</h2>
            <p>Evaluación de SKU, cantidades, descuentos y comparación por segmento.</p>
            <Button onClick={() => open("/cotizacion")}>
              <ClipboardList size={17} />
              Cotizar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
