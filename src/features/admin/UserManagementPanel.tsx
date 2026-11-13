import {
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "../../components/ui";
import { roles } from "../../constants/navigation";
import {
  checkAdminUserEmail,
  listAdminUsers,
  provisionAdminUser,
  updateAdminUserProfile,
} from "../../services/userManagement";
import type {
  AdminEmailLookupResult,
  AdminManagedUser,
  AdminUserProvisionStatus,
  AppRole,
} from "../../types/domain";
import "./user-management.css";

type ProvisionNotice = {
  tone: "new-user" | "existing-auth" | "existing-app" | "error";
  title: string;
  detail: string;
};

type UserRowDraft = {
  fullName: string;
  role: AppRole;
  newPassword: string;
  showPassword: boolean;
};

function roleLabel(role: AppRole) {
  return roles.find((item) => item.id === role)?.label ?? role;
}

function formatDateTime(iso?: string) {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-NI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildProvisionNotice(
  status: AdminUserProvisionStatus,
  email: string,
  role: AppRole,
): ProvisionNotice {
  const profileName = roleLabel(role);

  if (status === "existing_auth_profile_created") {
    return {
      tone: "existing-auth",
      title: `Perfil de usuario "${profileName}" creado para ${email}`,
      detail:
        "El usuario ya existía en autenticación, por lo que se creó su perfil en la tabla de usuarios de esta aplicación manteniendo su contraseña ya existente. Puede usar la misma contraseña que utiliza en otras aplicaciones.",
    };
  }

  if (status === "existing_profile_updated") {
    return {
      tone: "existing-auth",
      title: `Perfil de usuario "${profileName}" actualizado para ${email}`,
      detail:
        "El usuario ya existía en autenticación y en esta aplicación. Se actualizó su perfil manteniendo su contraseña ya existente; puede usar la misma contraseña en otras aplicaciones.",
    };
  }

  return {
    tone: "new-user",
    title: `Usuario ${email} y perfil "${profileName}" creados correctamente`,
    detail:
      "El usuario fue creado en autenticación y en el perfil de esta aplicación. Esta contraseña es aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación.",
  };
}

export function UserManagementPanel({
  users,
  loadingUsers,
  usersWarning,
  onRefreshUsers,
  onNotify,
}: {
  users: AdminManagedUser[];
  loadingUsers: boolean;
  usersWarning?: string;
  onRefreshUsers: () => void;
  onNotify?: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("asesor-comasa");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailLookup, setEmailLookup] = useState<AdminEmailLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<ProvisionNotice | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [draftEdits, setDraftEdits] = useState<Record<string, UserRowDraft>>({});
  const [savingUserId, setSavingUserId] = useState("");

  useEffect(() => {
    setDraftEdits((current) => {
      const next: Record<string, UserRowDraft> = {};
      users.forEach((user) => {
        const prev = current[user.id];
        next[user.id] = {
          fullName: prev ? prev.fullName : user.fullName,
          role: prev ? prev.role : user.role,
          newPassword: prev ? prev.newPassword : "",
          showPassword: prev ? prev.showPassword : false,
        };
      });
      return next;
    });
  }, [users]);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );
  const advisorCount = useMemo(
    () => users.filter((user) => user.role !== "admin").length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) =>
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        roleLabel(user.role).toLowerCase().includes(query),
    );
  }, [users, searchTerm]);

  const isExistingAuthUser = Boolean(emailLookup && emailLookup.existsInAuth);

  async function handleCheckEmail(targetEmail = email) {
    const clean = targetEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setEmailLookup(null);
      return;
    }

    setCheckingEmail(true);
    try {
      const response = await checkAdminUserEmail(clean);
      if (!response.ok) {
        setEmailLookup(null);
        return;
      }

      setEmailLookup(response.result);
      if (response.result.fullName && !fullName.trim()) {
        setFullName(response.result.fullName);
      }
      if (response.result.role) {
        setRole(response.result.role);
      }
    } finally {
      setCheckingEmail(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setNotice({
        tone: "error",
        title: "Correo inválido",
        detail: "Ingrese un correo electrónico válido para crear o asignar el usuario.",
      });
      return;
    }

    if (!isExistingAuthUser && password.length > 0 && password.length < 8) {
      setNotice({
        tone: "error",
        title: "Contraseña demasiado corta",
        detail: "Si el usuario es nuevo, la contraseña debe tener al menos 8 caracteres.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await provisionAdminUser({
        email: cleanEmail,
        fullName: fullName.trim(),
        role,
        password: isExistingAuthUser ? undefined : password,
      });

      if (!result.ok) {
        setNotice({
          tone: "error",
          title: "No se pudo procesar el usuario",
          detail: result.message,
        });
        return;
      }

      const builtNotice = buildProvisionNotice(result.status, result.email, result.role);
      setNotice(builtNotice);
      onNotify?.(`${builtNotice.title}. ${builtNotice.detail}`);

      setEmail("");
      setFullName("");
      setPassword("");
      setEmailLookup(null);
      onRefreshUsers();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveExistingUser(user: AdminManagedUser) {
    const draft = draftEdits[user.id] ?? {
      fullName: user.fullName,
      role: user.role,
      newPassword: "",
      showPassword: false,
    };

    const cleanPassword = draft.newPassword.trim();
    if (cleanPassword && cleanPassword.length < 8) {
      setNotice({
        tone: "error",
        title: "Contraseña demasiado corta",
        detail: "La nueva contraseña debe tener al menos 8 caracteres.",
      });
      return;
    }

    setSavingUserId(user.id);
    setNotice(null);
    try {
      const result = await updateAdminUserProfile({
        userId: user.id,
        fullName: draft.fullName,
        role: draft.role,
        newPassword: cleanPassword || undefined,
      });

      if (!result.ok) {
        setNotice({
          tone: "error",
          title: "No se pudo actualizar el usuario",
          detail: result.message,
        });
        return;
      }

      const profileName = roleLabel(draft.role);
      const userIdentifier = user.email || draft.fullName || user.id;

      setDraftEdits((current) => ({
        ...current,
        [user.id]: {
          ...draft,
          newPassword: "",
          showPassword: false,
        },
      }));

      setNotice({
        tone: result.passwordChanged ? "new-user" : "existing-auth",
        title: result.passwordChanged
          ? `Perfil "${profileName}" y contraseña actualizados para ${userIdentifier}`
          : `Perfil actualizado a "${profileName}" para ${userIdentifier}`,
        detail: result.message,
      });
      onNotify?.(result.message);
      onRefreshUsers();
    } finally {
      setSavingUserId("");
    }
  }

  function clearForm() {
    setEmail("");
    setFullName("");
    setRole("asesor-comasa");
    setPassword("");
    setEmailLookup(null);
    setNotice(null);
  }

  return (
    <div className="load-panel">
      <div className="load-panel-head">
        <div>
          <h2>Usuarios y perfiles</h2>
          <span>
            Cree usuarios nuevos, asigne perfiles a usuarios existentes de otras aplicaciones o edite perfiles y contraseñas de la tabla app_profiles.
          </span>
        </div>
        <div className="toolbar-actions">
          <Button variant="outline" onClick={onRefreshUsers} disabled={loadingUsers}>
            <RefreshCw size={16} />
            {loadingUsers ? "Actualizando..." : "Actualizar lista"}
          </Button>
        </div>
      </div>

      <div className="load-summary-grid">
        <div className="summary-tile">
          <span>Usuarios en app_profiles</span>
          <strong>{loadingUsers && !users.length ? "..." : users.length}</strong>
        </div>
        <div className="summary-tile">
          <span>Administradores</span>
          <strong>{loadingUsers && !users.length ? "..." : adminCount}</strong>
        </div>
        <div className="summary-tile">
          <span>Asesores comerciales</span>
          <strong>{loadingUsers && !users.length ? "..." : advisorCount}</strong>
        </div>
      </div>

      {usersWarning ? (
        <div className="user-mgmt-status-banner existing-app" role="status">
          <Info size={18} />
          <div className="user-mgmt-status-copy">
            <strong>Aviso de sincronización con Auth</strong>
            <span>{usersWarning}</span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className={`user-mgmt-status-banner ${notice.tone}`} role="status" aria-live="polite">
          {notice.tone === "error" ? (
            <TriangleAlert size={19} />
          ) : notice.tone === "existing-auth" ? (
            <UserCheck size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <div className="user-mgmt-status-copy">
            <strong>{notice.title}</strong>
            <span>{notice.detail}</span>
          </div>
        </div>
      ) : null}

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

        <form onSubmit={handleSubmit} className="user-mgmt-form">
          <div className="user-mgmt-form-grid">
            <div className="user-mgmt-field">
              <label htmlFor="admin-user-email">Correo electrónico</label>
              <div className="user-mgmt-inline-input">
                <input
                  id="admin-user-email"
                  type="email"
                  placeholder="ejemplo@comasa.com.ni"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailLookup && emailLookup.email !== event.target.value.trim().toLowerCase()) {
                      setEmailLookup(null);
                    }
                  }}
                  onBlur={() => void handleCheckEmail(email)}
                  disabled={submitting}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkingEmail || submitting || !email.trim().includes("@")}
                  onClick={() => void handleCheckEmail(email)}
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
                onChange={(event) => setFullName(event.target.value)}
                disabled={submitting}
              />
              <small>Nombre que aparecerá en el perfil y en las cotizaciones emitidas.</small>
            </div>

            <div className="user-mgmt-field">
              <label htmlFor="admin-user-role">Perfil de usuario en esta aplicación</label>
              <select
                id="admin-user-role"
                value={role}
                onChange={(event) => setRole(event.target.value as AppRole)}
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
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting || isExistingAuthUser}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting || isExistingAuthUser}
                  onClick={() => setShowPassword((prev) => !prev)}
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
            <Button type="button" variant="outline" onClick={clearForm} disabled={submitting}>
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

      <div className="preview-frame">
        <div className="preview-head">
          <h3>Usuarios registrados en app_profiles (edición de perfil y contraseña)</h3>
        </div>
        <div className="user-mgmt-table-toolbar">
          <div className="user-mgmt-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Buscar por nombre, correo, ID o perfil..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <span>
            Mostrando {filteredUsers.length} de {users.length} usuario(s) en app_profiles
          </span>
        </div>
        <div className="table-wrap">
          <table className="user-mgmt-table">
            <thead>
              <tr>
                <th>Correo / ID</th>
                <th>Nombre completo</th>
                <th>Perfil de usuario</th>
                <th>Nueva contraseña (opcional)</th>
                <th>Alta / Último acceso</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const draft = draftEdits[user.id] ?? {
                  fullName: user.fullName,
                  role: user.role,
                  newPassword: "",
                  showPassword: false,
                };
                const changed =
                  draft.fullName.trim() !== user.fullName.trim() ||
                  draft.role !== user.role ||
                  draft.newPassword.trim().length > 0;
                const isSaving = savingUserId === user.id;

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="user-mgmt-id-cell">
                        <strong>{user.email || user.fullName || "Usuario registrado"}</strong>
                        <small title={user.id}>ID: {user.id.slice(0, 8)}…</small>
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Nombre completo de ${user.email || user.id}`}
                        value={draft.fullName}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraftEdits((current) => ({
                            ...current,
                            [user.id]: { ...draft, fullName: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Perfil de ${user.email || user.id}`}
                        value={draft.role}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraftEdits((current) => ({
                            ...current,
                            [user.id]: { ...draft, role: event.target.value as AppRole },
                          }))
                        }
                      >
                        {roles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="user-mgmt-row-password">
                        <input
                          type={draft.showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          aria-label={`Nueva contraseña para ${user.email || user.id}`}
                          placeholder="Cambiar clave (mín. 8)"
                          value={draft.newPassword}
                          disabled={isSaving}
                          onChange={(event) =>
                            setDraftEdits((current) => ({
                              ...current,
                              [user.id]: { ...draft, newPassword: event.target.value },
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={isSaving}
                          onClick={() =>
                            setDraftEdits((current) => ({
                              ...current,
                              [user.id]: { ...draft, showPassword: !draft.showPassword },
                            }))
                          }
                          title={draft.showPassword ? "Ocultar clave" : "Mostrar clave"}
                        >
                          {draft.showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </Button>
                      </div>
                    </td>
                    <td>
                      <div className="user-mgmt-id-cell">
                        <span>{user.createdAt ? formatDateTime(user.createdAt) : "Registrado"}</span>
                        <Badge tone={user.lastSignInAt ? "success" : "neutral"}>
                          {user.lastSignInAt ? `Acceso: ${formatDateTime(user.lastSignInAt)}` : "En app_profiles"}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant={draft.newPassword.trim() ? "primary" : "outline"}
                        disabled={!changed || isSaving}
                        onClick={() => void handleSaveExistingUser(user)}
                      >
                        {isSaving ? (
                          <>Guardando...</>
                        ) : (
                          <>
                            <Save size={14} />
                            Guardar
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!filteredUsers.length ? (
                <tr>
                  <td colSpan={6}>
                    {loadingUsers
                      ? "Cargando usuarios de app_profiles..."
                      : "No se encontraron usuarios en app_profiles."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { listAdminUsers, ShieldCheck };
