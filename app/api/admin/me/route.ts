import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminJWT } from "@/lib/admin/session";

export async function GET(req: NextRequest) {
  const tok = req.cookies.get(COOKIE_NAME)?.value;
  if (!tok) return NextResponse.json({ error: "No session" }, { status: 401 });
  try {
    const payload = await verifyAdminJWT(tok);
    return NextResponse.json({ wallet: payload.wallet });
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
