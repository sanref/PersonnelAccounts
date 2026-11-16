import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pa_admin_session";
export const VIEWER_PIN_COOKIE_PREFIX = "pa_pin_";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "fallback-dev-secret-key";
  return new TextEncoder().encode(secret);
}

export async function signAdminToken(): Promise<string> {
  return await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getSecretKey());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

export async function requireAdmin(): Promise<void> {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    throw new Error("No autorizado");
  }
}

export async function signPinToken(shareToken: string): Promise<string> {
  return await new SignJWT({ shareToken })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getSecretKey());
}

export async function verifyPinToken(
  cookieVal: string | undefined,
  expectedShareToken: string
): Promise<boolean> {
  if (!cookieVal) return false;
  try {
    const { payload } = await jwtVerify(cookieVal, getSecretKey());
    return payload.shareToken === expectedShareToken;
  } catch {
    return false;
  }
}
