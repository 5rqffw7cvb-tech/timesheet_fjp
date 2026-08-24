import { SignJWT, jwtVerify } from "jose";

export interface SessionPayload {
  sub: string;
  username: string;
  role: "ADMIN" | "MEMBER";
  name: string;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters; see .env.example");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || !payload.role) return null;
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as "ADMIN" | "MEMBER",
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
