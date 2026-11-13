import type {
  AdminEmailLookupResult,
  AdminManagedUser,
  AdminUserProvisionStatus,
  AppRole,
} from "../types/domain";
import { appDb, supabase } from "./supabase";

type RpcCheckEmailPayload = {
  exists_in_auth?: boolean;
  exists_in_app?: boolean;
  user_id?: string | null;
  email?: string;
  full_name?: string | null;
  role?: AppRole | null;
};

type RpcProvisionPayload = {
  status?: AdminUserProvisionStatus;
  user_id?: string;
  email?: string;
  full_name?: string;
  role?: AppRole;
  message?: string;
};

type RpcUserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: AppRole;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type AppProfileTableRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role: AppRole;
  created_at?: string | null;
};

type QuoteCreatorRow = {
  created_by: string | null;
  generated_by_email: string | null;
  generated_by_name: string | null;
};

function isMissingUserRpcError(error: { code?: string; message: string }) {
  const lower = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    lower.includes("could not find the function") ||
    lower.includes("admin_provision_user") ||
    lower.includes("admin_list_users") ||
    lower.includes("admin_check_user_email") ||
    lower.includes("admin_update_user_profile") ||
    lower.includes("admin_update_user_password")
  );
}

function formatUserRpcError(error: { code?: string; message: string }) {
  if (
    isMissingUserRpcError(error) &&
    (error.code === "PGRST202" || error.message.toLowerCase().includes("could not find the function"))
  ) {
    return "Falta ejecutar o actualizar supabase/admin_users.sql en el SQL Editor de Supabase para habilitar las operaciones de Auth y contraseñas.";
  }
  return error.message || "No se pudo completar la operación de usuarios.";
}

export function provisionSuccessMessage(status: AdminUserProvisionStatus): string {
  if (status === "existing_auth_profile_created") {
    return "El perfil de usuario fue creado correctamente. Como el usuario ya existía, se mantuvo su contraseña actual y puede usar la misma contraseña en otras aplicaciones.";
  }
  if (status === "existing_profile_updated") {
    return "El perfil de usuario fue actualizado en esta aplicación. Se mantuvo su contraseña actual y puede usar la misma contraseña en otras aplicaciones.";
  }
  return "El usuario fue creado correctamente. Esta contraseña es aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación.";
}

export async function checkAdminUserEmail(
  email: string,
): Promise<{ ok: true; result: AdminEmailLookupResult } | { ok: false; message: string }> {
  const db = appDb();
  if (!db) {
    return { ok: false, message: "Supabase no está configurado en este entorno." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, message: "Ingrese un correo electrónico válido." };
  }

  const { data, error } = await db.rpc("admin_check_user_email", {
    target_email: normalizedEmail,
  });

  if (error) {
    return { ok: false, message: formatUserRpcError(error) };
  }

  const payload = (data ?? {}) as RpcCheckEmailPayload;
  return {
    ok: true,
    result: {
      existsInAuth: Boolean(payload.exists_in_auth),
      existsInApp: Boolean(payload.exists_in_app),
      userId: payload.user_id ?? undefined,
      email: payload.email ?? normalizedEmail,
      fullName: payload.full_name ?? undefined,
      role: payload.role ?? undefined,
    },
  };
}

export async function listAdminUsers(): Promise<
  | { ok: true; users: AdminManagedUser[]; warning?: string }
  | { ok: false; message: string }
> {
  const db = appDb();
  if (!db) {
    return { ok: false, message: "Supabase no está configurado en este entorno." };
  }

  const usersById = new Map<string, AdminManagedUser>();
  let rpcError: { code?: string; message: string } | null = null;

  // 1. Intentar la RPC enriquecida (cruza app_profiles con auth.users)
  if (typeof db.rpc === "function") {
    const rpcResponse = await db.rpc("admin_list_users");
    if (!rpcResponse.error && Array.isArray(rpcResponse.data)) {
      (rpcResponse.data as RpcUserRow[]).forEach((row) => {
        if (!row?.id) return;
        usersById.set(row.id, {
          id: row.id,
          email: row.email ?? "",
          fullName: row.full_name ?? "",
          role: row.role ?? "asesor-comasa",
          createdAt: row.created_at ?? "",
          lastSignInAt: row.last_sign_in_at ?? undefined,
        });
      });
    } else if (rpcResponse.error) {
      rpcError = rpcResponse.error;
    }
  }

  // 2. Consultar directamente la tabla app_profiles para garantizar que todos los perfiles existentes aparezcan
  if (typeof db.from === "function") {
    const tableResponse = await db.from("app_profiles").select("*");
    if (!tableResponse.error && Array.isArray(tableResponse.data)) {
      const profileRows = tableResponse.data as AppProfileTableRow[];

      // Si hay filas sin email (ej. cuando aún no se ha ejecutado admin_users.sql), enriquecer desde sesión o historial de cotizaciones
      const knownEmails = new Map<string, string>();
      const missingEmailIds = profileRows
        .filter((row) => !usersById.get(row.id)?.email && !row.email)
        .map((row) => row.id);

      if (missingEmailIds.length > 0) {
        try {
          if (supabase?.auth?.getSession) {
            const { data: sessionData } = await supabase.auth.getSession();
            const currentUser = sessionData?.session?.user;
            if (currentUser?.id && currentUser.email) {
              knownEmails.set(currentUser.id, currentUser.email);
            }
          }
          const quotesResponse = await db
            .from("quotes")
            .select("created_by,generated_by_email,generated_by_name")
            .in("created_by", missingEmailIds)
            .limit(300);

          if (!quotesResponse.error && Array.isArray(quotesResponse.data)) {
            (quotesResponse.data as QuoteCreatorRow[]).forEach((q) => {
              if (q.created_by && q.generated_by_email && !knownEmails.has(q.created_by)) {
                knownEmails.set(q.created_by, q.generated_by_email);
              }
            });
          }
        } catch {
          // Ignorar errores opcionales de enriquecimiento
        }
      }

      profileRows.forEach((row) => {
        if (!row?.id) return;
        const existing = usersById.get(row.id);
        const resolvedEmail = existing?.email || row.email || knownEmails.get(row.id) || "";
        usersById.set(row.id, {
          id: row.id,
          email: resolvedEmail,
          fullName: existing?.fullName || row.full_name || "",
          role: row.role ?? existing?.role ?? "asesor-comasa",
          createdAt: existing?.createdAt || row.created_at || "",
          lastSignInAt: existing?.lastSignInAt,
        });
      });
    } else if (tableResponse.error && usersById.size === 0) {
      return {
        ok: false,
        message: tableResponse.error.message || formatUserRpcError(rpcError ?? { message: "No se pudo leer app_profiles." }),
      };
    }
  } else if (rpcError && usersById.size === 0) {
    return { ok: false, message: formatUserRpcError(rpcError) };
  }

  const users = [...usersById.values()].sort((left, right) => {
    if (left.createdAt && right.createdAt && left.createdAt !== right.createdAt) {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return left.fullName.localeCompare(right.fullName, "es");
  });

  const warning =
    rpcError && isMissingUserRpcError(rpcError)
      ? "Se cargaron los perfiles de app_profiles. Para ver todos los correos de Auth, crear usuarios nuevos o cambiar contraseñas, ejecute supabase/admin_users.sql en el SQL Editor de Supabase."
      : undefined;

  return { ok: true, users, warning };
}

export async function provisionAdminUser(input: {
  email: string;
  fullName: string;
  role: AppRole;
  password?: string;
}): Promise<
  | {
      ok: true;
      status: AdminUserProvisionStatus;
      userId: string;
      email: string;
      fullName: string;
      role: AppRole;
      message: string;
    }
  | { ok: false; message: string }
> {
  const db = appDb();
  if (!db) {
    return { ok: false, message: "Supabase no está configurado en este entorno." };
  }

  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.fullName.trim();
  const cleanPassword = input.password ?? "";

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { ok: false, message: "Ingrese un correo electrónico válido." };
  }

  const { data, error } = await db.rpc("admin_provision_user", {
    user_email: cleanEmail,
    user_full_name: cleanName,
    user_role: input.role,
    user_password: cleanPassword || null,
  });

  if (error) {
    return { ok: false, message: formatUserRpcError(error) };
  }

  const payload = (data ?? {}) as RpcProvisionPayload;
  const status: AdminUserProvisionStatus = payload.status ?? "created_all";

  return {
    ok: true,
    status,
    userId: payload.user_id ?? "",
    email: payload.email ?? cleanEmail,
    fullName: payload.full_name ?? cleanName,
    role: payload.role ?? input.role,
    message: provisionSuccessMessage(status),
  };
}

export async function updateAdminUserProfile(input: {
  userId: string;
  fullName: string;
  role: AppRole;
  newPassword?: string;
}): Promise<{ ok: true; passwordChanged: boolean; message: string } | { ok: false; message: string }> {
  const db = appDb();
  if (!db) {
    return { ok: false, message: "Supabase no está configurado en este entorno." };
  }

  const cleanName = input.fullName.trim();
  const cleanPassword = (input.newPassword ?? "").trim();

  if (!cleanName) {
    return { ok: false, message: "El nombre del usuario no puede estar vacío." };
  }

  if (cleanPassword && cleanPassword.length < 8) {
    return { ok: false, message: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  // Intentar la RPC unificada (actualiza app_profiles y opcionalmente la contraseña en auth.users)
  if (typeof db.rpc === "function") {
    const rpcResult = await db.rpc("admin_update_user_profile", {
      target_user_id: input.userId,
      new_full_name: cleanName,
      new_role: input.role,
      new_password: cleanPassword || null,
    });

    if (!rpcResult.error) {
      return {
        ok: true,
        passwordChanged: Boolean(cleanPassword),
        message: cleanPassword
          ? "Perfil y contraseña actualizados correctamente. La nueva contraseña es aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación."
          : "Perfil de usuario actualizado correctamente manteniendo su contraseña actual.",
      };
    }

    // Si la RPC instalada aún es la versión de 3 parámetros (sin new_password)
    if (rpcResult.error.code === "PGRST202") {
      const legacyRpc = await db.rpc("admin_update_user_profile", {
        target_user_id: input.userId,
        new_full_name: cleanName,
        new_role: input.role,
      });

      if (!legacyRpc.error) {
        if (cleanPassword) {
          const pwdResult = await updateAdminUserPassword({
            userId: input.userId,
            newPassword: cleanPassword,
          });
          if (!pwdResult.ok) return pwdResult;
          return {
            ok: true,
            passwordChanged: true,
            message:
              "Perfil y contraseña actualizados correctamente. La nueva contraseña es aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación.",
          };
        }
        return {
          ok: true,
          passwordChanged: false,
          message: "Perfil de usuario actualizado correctamente manteniendo su contraseña actual.",
        };
      }
    }

    // Si no se pidió cambio de contraseña y aún no se ha instalado el SQL, actualizar directamente en app_profiles vía RLS
    if (!cleanPassword && isMissingUserRpcError(rpcResult.error) && typeof db.from === "function") {
      const directUpdate = await db
        .from("app_profiles")
        .update({ full_name: cleanName, role: input.role })
        .eq("id", input.userId);

      if (!directUpdate.error) {
        return {
          ok: true,
          passwordChanged: false,
          message: "Perfil de usuario actualizado en app_profiles.",
        };
      }
      return { ok: false, message: directUpdate.error.message };
    }

    return { ok: false, message: formatUserRpcError(rpcResult.error) };
  }

  return { ok: false, message: "No se pudo actualizar el usuario." };
}

export async function updateAdminUserPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const db = appDb();
  if (!db) {
    return { ok: false, message: "Supabase no está configurado en este entorno." };
  }

  const cleanPassword = input.newPassword.trim();
  if (cleanPassword.length < 8) {
    return { ok: false, message: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  const { error } = await db.rpc("admin_update_user_password", {
    target_user_id: input.userId,
    new_password: cleanPassword,
  });

  if (error) {
    return { ok: false, message: formatUserRpcError(error) };
  }

  return {
    ok: true,
    message:
      "Contraseña actualizada correctamente. Esta nueva contraseña es aplicable para todas las aplicaciones proporcionadas por el Departamento de Transformación.",
  };
}
