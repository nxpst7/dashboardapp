import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!);
const COOKIE_NAME = "admin_session";
const NONCE_COOKIE = "admin_nonce";

export { COOKIE_NAME, NONCE_COOKIE };

export async function signAdminJWT(payload: { wallet: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);
}

export async function verifyAdminJWT(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as { wallet: string; iat: number; exp: number };
}
