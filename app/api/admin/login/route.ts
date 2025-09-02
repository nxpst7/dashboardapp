import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { signAdminJWT, COOKIE_NAME, NONCE_COOKIE } from "@/lib/admin/session";
import { getAddress as checksum, verifyMessage } from "ethers";

export const runtime = "nodejs"; // 🔐 necesario si usas node:crypto

export async function GET(_req: NextRequest) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 600,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const { signature, wallet } = await req.json();

  // ⬇️ Leer nonce desde el request
  const nonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!nonce) return NextResponse.json({ error: "Missing nonce" }, { status: 400 });

  const message = `Jharvi Admin Login\n\nNonce: ${nonce}`;
  let recovered: string;
  try {
    recovered = checksum(verifyMessage(message, signature));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const w = checksum(wallet);
  if (recovered !== w) return NextResponse.json({ error: "Wallet/signature mismatch" }, { status: 401 });

  const supabaseSrv = getServiceSupabase();
  const { data, error } = await supabaseSrv
    .from("users")
    .select("role")
    .eq("wallet", w)
    .maybeSingle();

  if (error || !data || data.role !== "admin") {
    return NextResponse.json({ error: "Not an admin" }, { status: 403 });
  }

  const jwt = await signAdminJWT({ wallet: w });

  // ⬇️ Escribir cookies en la respuesta
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 60 * 60 * 12,
  });
  res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
