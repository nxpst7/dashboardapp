"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { useState, useEffect } from "react";
import { Button } from "./../components/ui/button";
import { useAuth } from "./context/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { normalizeEvmWallet } from "@/lib/wallet/normalize";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const { account, connectWallet, disconnectWallet } = useAuth();
  const router = useRouter();
  const [fingerprint, setFingerprint] = useState("");

  useEffect(() => {
    if (account) {
      router.push("/dashboard");
    }
  }, [account, router]);

  useEffect(() => {
    const getFingerprint = async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setFingerprint(result.visitorId);
    };
    getFingerprint();
  }, []);

  const handleDisconnect = () => {
    if (fingerprint) {
      disconnectWallet(fingerprint);
      router.push("/");
    }
  };

  const handleConnectWallet = async () => {
    if (!fingerprint) {
      alert("Error generating device fingerprint");
      return;
    }

    try {
      const raw = await connectWallet();
      if (!raw) return;

      // ✅ Normaliza ANTES de cualquier uso
      const wallet = normalizeEvmWallet(raw);

      const response = await fetch("/api/check-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, wallet }),
      });

      const data = await response.json();

      if (response.status === 403) {
        alert(data.error || "Access denied");
        return;
      }
      if (!response.ok) {
        alert(data.error || "Server error");
        return;
      }

      // Asegura que tu “select/update” en Supabase usa SIEMPRE la address normalizada
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("fingerprint")
        .eq("wallet", wallet)
        .single();

      if (!userError && !userData?.fingerprint) {
        await supabase.from("users").update({ fingerprint }).eq("wallet", wallet);
      }

      alert("Wallet connected successfully");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen pt-24 text-center overflow-hidden">
      {/* Imagen de fondo */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/garden.png"
          alt="Fondo Jharvi"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Contenido principal */}
      <div className="relative z-20 flex flex-col items-center">
        <div className="flex items-center gap-4 mb-14 px-4 py-2 backdrop-blur-md">
          <div className="flex -space-x-2">
            <img src="/avatar1.png" alt="user1" className="w-12 h-12 rounded-full bg-white border-2 border-green-400" />
            <img src="/avatar2.png" alt="user2" className="w-12 h-12 rounded-full bg-white border-2 border-green-400" />
            <img src="/avatar3.png" alt="user3" className="w-12 h-12 rounded-full bg-white border-2 border-green-400" />
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-black text-3xl border-2 border-green-400">+</div>
          </div>
          <span className="text-white text-xl">Trusted by 1M+ Crypto Users</span>
        </div>

        <h1 className="text-4xl font-semibold text-white mb-2">Connect Dashboard</h1>
        <p className="text-white mb-16 text-2xl">to start running our network and earn rewards</p>

        <Button
          onClick={handleConnectWallet}
          variant="outline"
          className="bg-gradient-to-r from-white via-green-400 to-white animate-gradient animate-spin-slow !text-black font-semibold hover:scale-105 transition-transform px-40 py-4 rounded-full"
        >
          {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Get Started"}
        </Button>

        <p className="mt-40 text-gray-600 text-xs">Jharvi © 2025</p>
      </div>
    </div>
  );
}
