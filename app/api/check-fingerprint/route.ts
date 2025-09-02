// /app/api/check-fingerprint/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { normalizeEvmWallet } from "@/lib/wallet/normalize";

export async function POST(req: Request) {
  try {
    const { fingerprint, wallet: rawWallet } = await req.json();

    if (!fingerprint || !rawWallet) {
      return NextResponse.json({ error: "Missing fingerprint or wallet" }, { status: 400 });
    }

    const wallet = normalizeEvmWallet(rawWallet);
    const supabase = getServiceSupabase(); // ✅ se crea en runtime

    // Lee si existe la fila
    const { data: userRow, error: selErr } = await supabase
      .from("users")
      .select("id,fingerprint,wallet")
      .eq("wallet", wallet)
      .maybeSingle();

    if (selErr) {
      console.error("select error:", selErr);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    // Regla ejemplo: una wallet no puede rotar fingerprint
    if (userRow && userRow.fingerprint && userRow.fingerprint !== fingerprint) {
      return NextResponse.json(
        { error: "Fingerprint already in use for this wallet" },
        { status: 403 }
      );
    }

    // Inserta si no existe
    if (!userRow) {
      const { error: insErr } = await supabase
        .from("users")
        .insert({ wallet, fingerprint });
      if (insErr) {
        // Si choca por unique, lo tratamos como idempotente
        if (!String(insErr.message || "").toLowerCase().includes("duplicate")) {
          console.error("insert error:", insErr);
          return NextResponse.json({ error: "Insert failed" }, { status: 500 });
        }
      }
    } else if (!userRow.fingerprint) {
      // Completa fingerprint si faltaba
      const { error: updErr } = await supabase
        .from("users")
        .update({ fingerprint })
        .eq("wallet", wallet);
      if (updErr) {
        console.error("update error:", updErr);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
