import { Eye, EyeOff, Info, KeyRound, Search, UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { Badge, Button } from "../../../components/ui";
import { roles } from "../../../constants/navigation";
import type { AdminEmailLookupResult, AppRole } from "../../../types/domain";
import { roleLabel } from "./UserManagementTable";

export function UserProvisionForm({
  email,
  fullName,
  role,
  password,
  showPassword,
  checkingEmail,
  emailLookup,
  submitting,
  isExistingAuthUser,
  onEmailChange,
  onFullNameChange,
  onRoleChange,
  onPasswordChange,
  onToggleShowPassword,
  onCheckEmail,
  onClear,
  onSubmit,
}: {
  email: string;
  fullName: string;
  role: AppRole;
  password: string;
  showPassword: boolean;
  checkingEmail: boolean;
  emailLookup: AdminEmailLookupResult | null;
  submitting: boolean;
  isExistingAuthUser: boolean;
  onEmailChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onRoleChange: (value: AppRole) => void;
  onPasswordChange: (value: string) => void;
  onToggleShowPassword: () => void;
  onCheckEmail: (targetEmail?: string) => void;
  onClear: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="user-mgmt-card" aria-label="Crear o habilitar usuario">
      <div className="user-mgmt-card-head">
        <div>
          <h3>Crear usuario o asignar perfil en esta aplicación</h3>
          <p>
            Si el correo ya existe en autenticación por otra aplicación, se creará su perfil en esta aplicación conservando su contraseña actual. Si es nuevo, se creará con contraseña global para todas las aplicaciones del Departamento de Transformación.
          </p>
        </div>
        <Badge tone={isExistingAuthUser ? "success" : "info"}>
          {isExistingAuthUser ? "Cuenta previa en Auth" : "Cuenta unificada Transformación"}
        </Badge>
      </div>

      {emailLookup ? (
        <div
          className={`user-mgmt-status-banner ${
            emailLookup.existsInApp
              ? "existing-app"
              : emailLookup.existsInAuth
                ? "existing-auth"
                : "new-user"
          }`}
          role="status"
        >
          <Info size={18} />
          <div className="user-mgmt-status-copy">
            {emailLookup.existsInAuth && !emailLookup.existsInApp ? (
              <>
                <strong>El usuario {emailLookup.email} ya existe en Auth (creado en otra aplicación)</strong>
                <span>
                  No tiene perfil en esta aplicación todavía. Al guardar se creará su perfil local con el rol seleccionado y se mantendrá su contraseña existente para que pueda usar la misma contraseña en todas las aplicaciones.
                </span>
              </>
            ) : emailLookup.existsInAuth && emailLookup.existsInApp ? (
              <>
                <strong>El usuario {emailLookup.email} ya cuenta con perfil en esta aplicación</strong>
                <span>
                  Su perfil actual es <strong>{emailLookup.role ? roleLabel(emailLookup.role) : "Asignado"}</strong>. Si guarda, se actualizará su perfil en esta aplicación manteniendo su contraseña existente.
                </span>
              </>
            ) : (
              <>
                <strong>Usuario nuevo ({emailLookup.email})</strong>
                <span>
                  No existe en Auth ni en esta aplicación. Defina una contraseña inicial: será aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación.
                </span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="user-mgmt-form">
        <div className="user-mgmt-form-grid">
          <div className="user-mgmt-field">
            <label htmlFor="admin-user-email">Correo electrónico</label>
            <div className="user-mgmt-inline-input">
              <input
                id="admin-user-email"
                type="email"
                placeholder="ejemplo@comasa.com.ni"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                onBlur={() => onCheckEmail(email)}
                disabled={submitting}
                required
              />
              <Button
                type="button"
                variant="outline"
                disabled={checkingEmail || submitting || !email.trim().includes("@")}
                onClick={() => onCheckEmail(email)}
              >
                <Search size={15} />
                {checkingEmail ? "Verificando..." : "Verificar"}
              </Button>
            </div>
            <small>Al verificar el correo se comprueba si ya existe en Auth o si es un usuario nuevo.</small>
          </div>

          <div className="user-mgmt-field">
            <label htmlFor="admin-user-name">Nombre completo</label>
            <input
              id="admin-user-name"
              type="text"
              placeholder="Nombre y apellido del colaborador"
              value={fullName}
              onChange={(event) => onFullNameChange(event.target.value)}
              disabled={submitting}
            />
            <small>Nombre que aparecerá en el perfil y en las cotizaciones emitidas.</small>
          </div>

          <div className="user-mgmt-field">
            <label htmlFor="admin-user-role">Perfil de usuario en esta aplicación</label>
            <select
              id="admin-user-role"
              value={role}
              onChange={(event) => onRoleChange(event.target.value as AppRole)}
              disabled={submitting}
            >
              {roles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({item.id})
                </option>
              ))}
            </select>
            <small>Define los permisos y alcance del usuario dentro del Cotizador COMASA.</small>
          </div>

          <div className="user-mgmt-field">
            <label htmlFor="admin-user-password">
              {isExistingAuthUser ? "Contraseña (se conserva la actual)" : "Contraseña inicial"}
            </label>
            <div className="user-mgmt-inline-input">
              <input
                id="admin-user-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={
                  isExistingAuthUser
                    ? "Se mantendrá la contraseña existente en Auth"
                    : "Mínimo 8 caracteres (aplicable a todas las apps)"
                }
                value={isExistingAuthUser ? "" : password}
                onChange={(event) => onPasswordChange(event.target.value)}
                disabled={submitting || isExistingAuthUser}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={submitting || isExistingAuthUser}
                onClick={onToggleShowPassword}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
            <small>
              {isExistingAuthUser
                ? "El usuario ya existe en Auth: se mantendrá su contraseña actual y podrá usarla en esta y otras aplicaciones."
                : "Si el usuario es nuevo, esta contraseña será aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación."}
            </small>
          </div>
        </div>

        <div className="user-mgmt-form-actions">
          <Button type="button" variant="outline" onClick={onClear} disabled={submitting}>
            Limpiar
          </Button>
          <Button type="submit" disabled={submitting || !email.trim()}>
            {isExistingAuthUser ? <KeyRound size={16} /> : <UserPlus size={16} />}
            {submitting
              ? "Procesando..."
              : emailLookup?.existsInApp
                ? "Actualizar perfil en esta app"
                : isExistingAuthUser
                  ? "Crear perfil manteniendo contraseña"
                  : "Crear usuario"}
          </Button>
        </div>
      </form>
    </section>
  );
}
