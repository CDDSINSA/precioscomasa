import { Eye, EyeOff, Save, Search } from "lucide-react";
import { Badge, Button } from "../../../components/ui";
import { roles } from "../../../constants/navigation";
import type { AdminManagedUser, AppRole } from "../../../types/domain";

export type UserRowDraft = {
  fullName: string;
  role: AppRole;
  newPassword: string;
  showPassword: boolean;
};

export function roleLabel(role: AppRole) {
  return roles.find((item) => item.id === role)?.label ?? role;
}

export function formatDateTime(iso?: string) {
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

export function UserManagementTable({
  users,
  filteredUsers,
  loadingUsers,
  searchTerm,
  draftEdits,
  savingUserId,
  onSearchTermChange,
  onDraftChange,
  onSaveUser,
}: {
  users: AdminManagedUser[];
  filteredUsers: AdminManagedUser[];
  loadingUsers: boolean;
  searchTerm: string;
  draftEdits: Record<string, UserRowDraft>;
  savingUserId: string;
  onSearchTermChange: (value: string) => void;
  onDraftChange: (userId: string, draft: UserRowDraft) => void;
  onSaveUser: (user: AdminManagedUser) => void;
}) {
  return (
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
            onChange={(event) => onSearchTermChange(event.target.value)}
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
                      onChange={(event) => onDraftChange(user.id, { ...draft, fullName: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Perfil de ${user.email || user.id}`}
                      value={draft.role}
                      disabled={isSaving}
                      onChange={(event) => onDraftChange(user.id, { ...draft, role: event.target.value as AppRole })}
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
                        onChange={(event) => onDraftChange(user.id, { ...draft, newPassword: event.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={() => onDraftChange(user.id, { ...draft, showPassword: !draft.showPassword })}
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
                      onClick={() => onSaveUser(user)}
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
  );
}
