import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AppProfile, AppRole } from "../types/domain";
import { supabase } from "./supabase";

type ProfileRow = {
  id: string;
  full_name: string;
  role: AppRole;
};

function toProfile(row: ProfileRow, email: string): AppProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    email,
  };
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { ok: false, message: "Supabase no esta configurado." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true, message: "Ingreso correcto." };

  const message = error.message.toLowerCase().includes("invalid login credentials")
    ? "No se pudo ingresar. Revise que el usuario tenga clave activa y correo confirmado."
    : error.message;

  return { ok: false, message };
}

export async function requestPasswordReset(email: string) {
  if (!supabase) return { ok: false, message: "Supabase no esta configurado." };
  if (!email.trim()) return { ok: false, message: "Ingrese el correo para enviar la recuperacion." };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });

  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: "Se envio un correo para restablecer la clave." };
}

export async function updatePassword(password: string) {
  if (!supabase) return { ok: false, message: "Supabase no esta configurado." };
  if (password.length < 8) return { ok: false, message: "La clave debe tener al menos 8 caracteres." };

  const { error } = await supabase.auth.updateUser({ password });
  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: "Clave actualizada. Ingrese nuevamente." };
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback: (session: Session | null, event: AuthChangeEvent) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export function isPasswordRecoveryUrl() {
  const url = `${window.location.search}${window.location.hash}`;
  return url.includes("type=recovery");
}

export async function getProfile(session: Session | null): Promise<AppProfile | null> {
  if (!supabase || !session?.user) return null;

  const { data, error } = await supabase
    .from("app_profiles")
    .select("id, full_name, role")
    .eq("id", session.user.id)
    .maybeSingle<ProfileRow>();

  if (!error && data) return toProfile(data, session.user.email ?? "");

  const ensured = await supabase.rpc("ensure_app_profile");
  const ensuredRow = Array.isArray(ensured.data) ? ensured.data[0] as ProfileRow | undefined : undefined;

  return ensured.error || !ensuredRow ? null : toProfile(ensuredRow, session.user.email ?? "");
}

export function defaultPathForRole(role: AppRole) {
  return role === "admin" ? "/" : "/cotizacion";
}
