import { getCookie, setCookie } from "hono/cookie";
import { sha256Hex, type GuestSessionResponse } from "@incident-commander/contracts";
import type { GuestRow } from "@incident-commander/db";
import type { Context } from "hono";
import type { ApiEnv } from "./env";

export const GUEST_COOKIE = "ic_guest";
const GUEST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const GUEST_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export function generateGuestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function resolveGuest(c: Context, findGuest: (hash: string) => Promise<GuestRow | undefined>): Promise<GuestRow | undefined> {
  const token = getCookie(c, GUEST_COOKIE);
  if (!token) return undefined;
  const guest = await findGuest(await hashToken(token));
  if (!guest) return undefined;
  if (guest.expiresAt.getTime() <= Date.now()) return undefined;
  return guest;
}

export async function establishGuest(
  c: Context,
  env: ApiEnv,
  create: (params: { tokenHash: string; expiresAt: Date }) => Promise<{ id: string; expiresAt: Date }>,
  findGuest: (hash: string) => Promise<GuestRow | undefined>,
): Promise<{ guestId: string; expiresAt: string; created: boolean }> {
  const existing = await resolveGuest(c, findGuest);
  if (existing) {
    return { guestId: existing.id, expiresAt: existing.expiresAt.toISOString(), created: false };
  }
  const token = generateGuestToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + GUEST_TTL_MS);
  const guest = await create({ tokenHash, expiresAt });
  setCookie(c, GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: env.isProduction,
    maxAge: GUEST_MAX_AGE_SECONDS,
  });
  return { guestId: guest.id, expiresAt: expiresAt.toISOString(), created: true };
}

export function guestSessionResponse(result: { guestId: string; expiresAt: string }): GuestSessionResponse {
  return { guestId: result.guestId, expiresAt: result.expiresAt };
}
