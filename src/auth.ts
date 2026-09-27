import type { Env } from "./types.ts";

/** 定数時間比較（泡沫 auth.ts から） */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Bearer 検証。API_TOKEN 未設定なら "unconfigured"（誤って無認証で開かない） */
export function checkBearer(
  authorization: string | undefined,
  env: Env
): "ok" | "unauthorized" | "unconfigured" {
  if (!env.API_TOKEN) return "unconfigured";
  const m = authorization?.match(/^Bearer\s+(.+)$/);
  const token = m?.[1]?.trim();
  if (!token) return "unauthorized";
  return timingSafeEqual(token, env.API_TOKEN) ? "ok" : "unauthorized";
}
