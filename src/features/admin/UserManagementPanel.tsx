import { CheckCircle2, Info, RefreshCw, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui";
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
import { UserManagementTable, roleLabel, type UserRowDraft } from "./components/UserManagementTable";
import { UserProvisionForm } from "./components/UserProvisionForm";
import "./user-management.css";

type ProvisionNotice = {
  tone: "new-user" | "existing-auth" | "existing-app" | "error";
  title: string;
  detail: string;
};

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

      <UserProvisionForm
        email={email}
        fullName={fullName}
        role={role}
        password={password}
        showPassword={showPassword}
        checkingEmail={checkingEmail}
        emailLookup={emailLookup}
        submitting={submitting}
        isExistingAuthUser={isExistingAuthUser}
        onEmailChange={(value) => {
          setEmail(value);
          if (emailLookup && emailLookup.email !== value.trim().toLowerCase()) {
            setEmailLookup(null);
          }
        }}
        onFullNameChange={setFullName}
        onRoleChange={setRole}
        onPasswordChange={setPassword}
        onToggleShowPassword={() => setShowPassword((prev) => !prev)}
        onCheckEmail={(targetEmail) => void handleCheckEmail(targetEmail)}
        onClear={clearForm}
        onSubmit={handleSubmit}
      />

      <UserManagementTable
        users={users}
        filteredUsers={filteredUsers}
        loadingUsers={loadingUsers}
        searchTerm={searchTerm}
        draftEdits={draftEdits}
        savingUserId={savingUserId}
        onSearchTermChange={setSearchTerm}
        onDraftChange={(userId, draft) =>
          setDraftEdits((current) => ({
            ...current,
            [userId]: draft,
          }))
        }
        onSaveUser={(user) => void handleSaveExistingUser(user)}
      />
    </div>
  );
}

export { listAdminUsers, ShieldCheck };
