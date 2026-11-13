import { KeyRound, LogIn } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Button } from "../../components/ui";
import { requestPasswordReset, signIn, signOut, updatePassword } from "../../services/auth";
import comasaLogo from "../../assets/logo-comasa-color.png";
import comasaLogoWhite from "../../assets/logo-comasa-blanco.png";

const benefits = [
  "Precios, existencias y promociones vigentes del catálogo COMASA.",
  "Valoracion de precios por ofertas.",
  "Emisión de cotizaciones formales en PDF, listas para el cliente.",
];

type AuthLayoutProps = {
  kicker: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  help?: ReactNode;
};

function AuthLayout({ kicker, title, subtitle, children, help }: AuthLayoutProps) {
  return (
    <main className="login-main">
      <div className="login-layout">
        <section className="login-brand-panel" aria-label="Cotizador COMASA">
          <div className="login-brand-content">
            <img className="login-brand-logo" src={comasaLogoWhite} alt="COMASA" />
            <span className="login-brand-eyebrow">Cotizador</span>
            <h1>Acceso a precios y promociones segmentadas.</h1>
            <p>
              Consulte el catálogo de COMASA, aplique las ofertas vigentes y emita.
            </p>
            <div className="login-benefits">
              {benefits.map((benefit, index) => (
                <div className="login-benefit" key={benefit}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-card">
            <div className="login-mobile-logo">
              <img src={comasaLogo} alt="COMASA" />
            </div>
            <div className="login-heading">
              <span className="login-kicker">{kicker}</span>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
            {children}
            {help ? <p className="login-help">{help}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthMessage({ message }: { message?: string }) {
  return (
    <div className="login-feedback" role="status" aria-live="polite">
      {message ? <AppFeedback tone="info" message={message} /> : null}
    </div>
  );
}

export function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const result = await signIn(email, password);
    setMessage(result.message);
    setLoading(false);
  }

  async function handlePasswordReset() {
    setResetting(true);
    const result = await requestPasswordReset(email);
    setMessage(result.message);
    setResetting(false);
  }

  return (
    <AuthLayout
      kicker="Acceso"
      title="Iniciar sesión"
      subtitle="Ingrese con su correo y contraseña."
      help="¿No tiene acceso o necesita ayuda? Comuníquese con el administrador del cotizador."
    >
      <AuthMessage message={message} />
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Button type="submit" className="login-submit" disabled={loading}>
          <LogIn size={16} />
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
        <button className="auth-link" disabled={resetting || !email.trim()} type="button" onClick={handlePasswordReset}>
          ¿Olvidó su contraseña? Restablecer clave
        </button>
      </form>
    </AuthLayout>
  );
}

export function AccessPendingPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <AuthLayout
      kicker="Acceso"
      title="Perfil pendiente"
      subtitle="Su perfil aún no está autorizado. Contacte al administrador para activar el acceso."
    >
      <Button variant="outline" className="login-secondary" onClick={onSignOut}>Cerrar sesión</Button>
    </AuthLayout>
  );
}

export function PasswordRecoveryPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("Las claves no coinciden.");
      return;
    }

    setSaving(true);
    const result = await updatePassword(password);
    setMessage(result.message);
    setSaving(false);

    if (result.ok) {
      await signOut();
      window.history.replaceState(null, "", "/");
      onDone();
    }
  }

  return (
    <AuthLayout
      kicker="Seguridad"
      title="Nueva clave"
      subtitle="Defina una clave para volver a ingresar al cotizador."
    >
      <AuthMessage message={message} />
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="recovery-password">Nueva clave</label>
          <input
            id="recovery-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="recovery-confirm">Confirmar clave</label>
          <input
            id="recovery-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        <Button type="submit" className="login-submit" disabled={saving}>
          <KeyRound size={16} />
          Guardar clave
        </Button>
      </form>
    </AuthLayout>
  );
}
