// pages/api/check-fingerprint.ts
import { supabase } from "@/lib/supabase";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { fingerprint, wallet } = req.body;

  if (!fingerprint || !wallet) {
    return res.status(400).json({ error: "Missing fingerprint or wallet" });
  }

  const { data, error } = await supabase
    .from("user_fingerprints")
    .select("wallet")
    .eq("fingerprint", fingerprint)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: "Database error" });
  }

  // Si ya existe y es otra wallet → bloquear
  if (data && data.wallet !== wallet) {
    return res.status(403).json({ error: "This device is already linked to another wallet." });
  }

  // Si no existe → insertar
  if (!data) {
    const { error: insertError } = await supabase
      .from("user_fingerprints")
      .insert({ fingerprint, wallet });

    if (insertError) {
      return res.status(500).json({ error: "Failed to save data" });
    }
  }

  return res.status(200).json({ success: true });
}
