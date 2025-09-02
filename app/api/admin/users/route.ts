import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminJWT } from "@/lib/admin/session";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { normalizeEvmWallet } from "@/lib/wallet/normalize";

// ============ helpers de este archivo ============
type SortKey =
  | "wallet"
  | "role"
  | "total_points"
  | "daily_points"
  | "country_code"
  | "last_seen_at"
  | "is_banned";

function parseQuery(url: URL) {
  const qp = url.searchParams;
  const limit = Math.min(Math.max(parseInt(qp.get("limit") || "20", 10), 1), 5000);
  const page = Math.max(parseInt(qp.get("page") || "1", 10), 1);
  const offset = (page - 1) * limit;

  const q = (qp.get("q") || "").trim();
  const role = (qp.get("role") || "all") as "all" | "user" | "admin";
  const banned = (qp.get("banned") || "all") as "all" | "only" | "none";
  const country = (qp.get("country") || "").trim().toUpperCase();
  const sortBy = (qp.get("sortBy") || "last_seen_at") as SortKey | string;
  const sortDir = (qp.get("sortDir") || "desc") as "asc" | "desc";

  const allowedSort: SortKey[] = [
    "wallet",
    "role",
    "total_points",
    "daily_points",
    "country_code",
    "last_seen_at",
    "is_banned",
  ];
  const sort = (allowedSort as string[]).includes(sortBy) ? (sortBy as SortKey) : "last_seen_at";
  const ascending = sortDir === "asc";

  return { limit, page, offset, q, role, banned, country, sort, ascending };
}

async function requireAdmin(req: NextRequest) {
  const tok = req.cookies.get(COOKIE_NAME)?.value;
  if (!tok) return null;
  try {
    return await verifyAdminJWT(tok);
  } catch {
    return null;
  }
}

// misma función que usas en el cliente, pero aquí en el server
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

// ================== GET (tu versión) ==================
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { limit, offset, q, role, banned, country, sort, ascending } = parseQuery(url);

  const supabase = getServiceSupabase();

  // Traemos también referral_code para poder calcular referidos
  let query = supabase
    .from("users")
    .select(
      "wallet, role, is_banned, country_code, total_points, daily_points, last_seen_at, referral_code",
      { count: "exact" }
    );

  // Filtros
  if (role !== "all") query = query.eq("role", role);
  if (banned === "only") query = query.eq("is_banned", true);
  if (banned === "none") query = query.eq("is_banned", false);
  if (country) query = query.eq("country_code", country);

  if (q) {
    const orParts = [`wallet.ilike.%${q}%`];
    const n = Number(q);
    if (Number.isFinite(n)) {
      orParts.push(`total_points.eq.${n}`, `daily_points.eq.${n}`);
    }
    query = query.or(orParts.join(","));
  }

  // Orden + paginación (solo por campos nativos)
  query = query.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data ?? [];

  // ===== Cálculo de referidos por referral_code (sin view) =====
  const codes = Array.from(new Set(users.map((u: any) => u.referral_code).filter(Boolean)));
  const refMap = new Map<
    string,
    { total: number; completed: number; pending: number }
  >();

  if (codes.length > 0) {
    const { data: refs, error: refErr } = await supabase
      .from("users")
      .select("referred_by, session_elapsed_human")
      .in("referred_by", codes);

    if (!refErr && refs) {
      for (const r of refs as any[]) {
        const key = r.referred_by as string;
        const hours = parseHours(r.session_elapsed_human);
        const agg = refMap.get(key) || { total: 0, completed: 0, pending: 0 };
        agg.total += 1;
        if (hours >= 100) agg.completed += 1;
        else agg.pending += 1;
        refMap.set(key, agg);
      }
    }
  }

  const out = users.map((u: any) => {
    const agg = u.referral_code ? refMap.get(u.referral_code) : undefined;
    return {
      wallet: u.wallet,
      role: u.role,
      is_banned: u.is_banned,
      country_code: u.country_code,
      total_points: u.total_points,
      daily_points: u.daily_points,
      last_seen_at: u.last_seen_at,
      referrals_total: agg?.total ?? 0,
      referrals_completed: agg?.completed ?? 0,
      referrals_pending: agg?.pending ?? 0,
    };
  });

  return NextResponse.json({
    users: out,
    total: count ?? 0,
    limit,
    offset,
  });
}

// ================== PATCH (nuevo) ==================
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawWallet: string | undefined = body?.wallet;
  const action: "ban" | "unban" | "reset_daily" | "set_points" | undefined = body?.action;
  const value: number | undefined = body?.value;

  if (!rawWallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  // 🔐 Normaliza SIEMPRE en el server (evita problemas de checksum/caso)
  const wallet = normalizeEvmWallet(rawWallet);

  try {
    switch (action) {
      case "ban": {
        const { error } = await supabase.from("users").update({ is_banned: true }).eq("wallet", wallet);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "unban": {
        const { error } = await supabase.from("users").update({ is_banned: false }).eq("wallet", wallet);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "reset_daily": {
        const { error } = await supabase
          .from("users")
          .update({ daily_points: 0, last_reset_at: new Date().toISOString() })
          .eq("wallet", wallet);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "set_points": {
        if (!Number.isFinite(value as number)) {
          return NextResponse.json({ error: "Invalid 'value' (number required)" }, { status: 400 });
        }
        const n = Math.max(0, Math.floor(value as number));
        const { error } = await supabase.from("users").update({ total_points: n }).eq("wallet", wallet);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    console.error("admin/users PATCH error:", e);
    // Devuelve mensaje claro para que el UI lo muestre
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
