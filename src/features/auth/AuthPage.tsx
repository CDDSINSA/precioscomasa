import { KeyRound, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Button, Card, CardContent } from "../../components/ui";
import { requestPasswordReset, signIn, signOut, updatePassword } from "../../services/auth";

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
    <div className="auth-page">
      <Card className="auth-card">
        <CardContent>
          <div className="auth-head">
            <div className="brand-mark">C</div>
            <h1>COMASA</h1>
            <p>Acceso al cotizador comercial.</p>
          </div>
          {message ? <AppFeedback tone="info" message={message} /> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Correo</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="field">
              <span>Clave</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <Button disabled={loading}>
              <LogIn size={16} />
              Ingresar
            </Button>
            <button className="auth-link" disabled={resetting} type="button" onClick={handlePasswordReset}>
              Restablecer clave
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function AccessPendingPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <CardContent>
          <div className="auth-head">
            <div className="brand-mark">C</div>
            <h1>Perfil pendiente</h1>
            <p>Ejecute nuevamente el script SQL y vuelva a ingresar. Si persiste, revise `app_profiles`.</p>
          </div>
          <Button variant="outline" onClick={onSignOut}>Cerrar sesion</Button>
        </CardContent>
      </Card>
    </div>
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
    <div className="auth-page">
      <Card className="auth-card">
        <CardContent>
          <div className="auth-head">
            <div className="brand-mark">C</div>
            <h1>Nueva clave</h1>
            <p>Defina una clave para volver a ingresar al cotizador.</p>
          </div>
          {message ? <AppFeedback tone="info" message={message} /> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nueva clave</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="field">
              <span>Confirmar clave</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </label>
            <Button disabled={saving}>
              <KeyRound size={16} />
              Guardar clave
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
