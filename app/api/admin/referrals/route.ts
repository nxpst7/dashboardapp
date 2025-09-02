import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminJWT } from "@/lib/admin/session";
import { getServiceSupabase } from "@/lib/supabaseServer";

async function requireAdmin(req: NextRequest) {
  const tok = req.cookies.get(COOKIE_NAME)?.value;
  if (!tok) return null;
  try {
    return await verifyAdminJWT(tok);
  } catch {
    return null;
  }
}

function parseHours(input: unknown): number {
  if (input == null) return 0;
  if (typeof input === "number") return input;
  const raw = String(input).trim().toLowerCase();
  if (/^\d{1,3}:\d{1,2}(:\d{1,2})?$/.test(raw)) {
    const parts = raw.split(":");
    const hh = Number(parts[0] ?? 0);
    const mm = Number(parts[1] ?? 0);
    const ss = Number(parts[2] ?? 0);
    return hh + mm / 60 + ss / 3600;
  }
  let hours = 0;
  const d = raw.match(/(\d+(?:\.\d+)?)\s*d/);
  const h = raw.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = raw.match(/(\d+(?:\.\d+)?)\s*m/);
  const s = raw.match(/(\d+(?:\.\d+)?)\s*s/);
  if (d) hours += parseFloat(d[1]) * 24;
  if (h) hours += parseFloat(h[1]);
  if (m) hours += parseFloat(m[1]) / 60;
  if (s) hours += parseFloat(s[1]) / 3600;
  if (hours > 0) return hours;
  const num = raw.match(/(\d+(?:\.\d+)?)/);
  if (num) return parseFloat(num[1]);
  return 0;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

  const supabase = getServiceSupabase();

  // 1) obtener el referral_code del dueño
  const { data: owner, error: ownerErr } = await supabase
    .from("users")
    .select("referral_code")
    .eq("wallet", wallet)
    .maybeSingle();

  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  const code = owner?.referral_code;
  if (!code) return NextResponse.json({ items: [] });

  // 2) traer sus referidos
  const { data: rows, error: rowsErr } = await supabase
    .from("users")
    .select("wallet, session_elapsed_human, last_seen_at, total_points")
    .eq("referred_by", code)
    .limit(5000);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const items = (rows ?? []).map((r: any) => {
    const hours = parseHours(r.session_elapsed_human);
    return {
      wallet: r.wallet,
      hours: Math.round(hours * 10) / 10,
      last_seen_at: r.last_seen_at,
      total_points: Number(r.total_points ?? 0),
      completed: hours >= 100,
    };
  });

  return NextResponse.json({ items });
}
