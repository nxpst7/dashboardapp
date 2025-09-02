// app/api/wallet-register/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // <- service_role AQUÍ

export async function POST(req: Request) {
  try {
    const { wallet, fingerprint } = await req.json();
    if (!wallet || !fingerprint) {
      return NextResponse.json({ error: "Missing wallet or fingerprint" }, { status: 400 });
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: existing, error: selErr } = await supabase
      .from("users")
      .select("wallet,fingerprint")
      .eq("wallet", wallet)
      .maybeSingle();

    if (selErr) {
      console.error("select error:", selErr);
      return NextResponse.json({ error: "select error" }, { status: 500 });
    }

    if (!existing) {
      const { error: insErr } = await supabase
        .from("users")
        .insert([{ wallet, fingerprint, total_points: 0, daily_points: 0, last_reset_at: new Date().toISOString() }]);
      if (insErr) {
        console.error("insert error:", insErr);
        return NextResponse.json({ error: "insert error" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!existing.fingerprint) {
      const { error: updErr } = await supabase
        .from("users")
        .update({ fingerprint })
        .eq("wallet", wallet);
      if (updErr) {
        console.error("update error:", updErr);
        return NextResponse.json({ error: "update error" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (existing.fingerprint !== fingerprint) {
      // Rechazar (o permitir si implementas re-enlace con verificación extra)
      return NextResponse.json({ error: "Acceso denegado: fingerprint distinto" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
