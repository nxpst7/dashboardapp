"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import ProfilePopup from "@/components/ProfilePopup";
import { createClient } from "@supabase/supabase-js";

// ✅ instancia única de Supabase (igual que en Dashboard)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Opcional: define el dominio/base de tu registro
const REGISTER_BASE_URL =
  process.env.NEXT_PUBLIC_REGISTER_BASE_URL || "https://app.jharvi.com/register/";

// --- util: código corto base62 (sin dependencias) ---
function makeReferralCode(len = 12) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // sin 0/O/I/l
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[arr[i] % alphabet.length];
  }
  return out;
}

export default function Navbar({
  onJoinCollective,
  onToggleNetwork,
  isRunning, // opcional: si viene, tiene prioridad
  isProcessing,
}: {
  onJoinCollective?: () => void;
  onToggleNetwork?: () => void;
  isRunning?: boolean;
  isProcessing?: boolean;
}) {
  const { account, connectWallet, disconnectWallet } = useAuth();
  const [fingerprint, setFingerprint] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Share modal
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string>("");
  const referralLink = `${REGISTER_BASE_URL}?referralCode=${encodeURIComponent(
    referralCode || ""
  )}`;

  const router = useRouter();

  // Estado derivado desde BD cuando NO recibimos isRunning por props
  const [dbIsRunning, setDbIsRunning] = useState<boolean | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  // Fingerprint (para tu flujo de logout)
  useEffect(() => {
    const getFingerprint = async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setFingerprint(result.visitorId);
    };
    getFingerprint();
  }, []);

  // Asegurar referral_code único por usuario
  useEffect(() => {
    if (!account) return;
    let cancelled = false;

    const ensureReferralCode = async () => {
      // 1) leer
      const { data, error } = await supabase
        .from("users")
        .select("referral_code")
        .eq("wallet", account)
        .maybeSingle();

      if (error) {
        console.error("read referral_code error:", error);
        return;
      }

      let code = data?.referral_code as string | null;

      // 2) crear si no existe
      if (!code) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const newCode = makeReferralCode(12);
          const { error: upErr } = await supabase
            .from("users")
            .update({ referral_code: newCode })
            .eq("wallet", account);
          if (!upErr) {
            code = newCode;
            break;
          }
          // manejar colisión de UNIQUE
          if ((upErr as any)?.code === "23505") continue;
          console.error("upsert referral_code error:", upErr);
          break;
        }
      }

      if (!cancelled && code) setReferralCode(code);
    };

    ensureReferralCode();

    return () => {
      cancelled = true;
    };
  }, [account]);

  // Hidratar desde BD y suscribirse a cambios si no llega isRunning por props
  useEffect(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!account || typeof isRunning === "boolean") {
      setDbIsRunning(null);
      return;
    }

    let cancelled = false;

    (async () => {
      // Lectura inicial
      const { data, error } = await supabase
        .from("users")
        .select("session_is_running")
        .eq("wallet", account)
        .maybeSingle();

      if (!cancelled) {
        if (!error && data) {
          setDbIsRunning(Boolean(data.session_is_running));
        } else {
          setDbIsRunning(false);
        }
      }

      // Realtime
      const channel = supabase
        .channel(`users-session-${account}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users",
            filter: `wallet=eq.${account}`,
          },
          (payload: any) => {
            const row = payload.new ?? payload.record ?? {};
            if (Object.prototype.hasOwnProperty.call(row, "session_is_running")) {
              setDbIsRunning(Boolean(row.session_is_running));
            }
          }
        )
        .subscribe();

      realtimeChannelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [account, isRunning]);

  // Estado efectivo que usará el botón
  const effectiveRunning = useMemo(() => {
    return typeof isRunning === "boolean" ? isRunning : dbIsRunning ?? false;
  }, [isRunning, dbIsRunning]);

  const handleWalletClick = async () => {
    if (account) {
      await disconnectWallet(fingerprint);
      router.push("/");
    } else {
      await connectWallet();
    }
  };

  const label = isProcessing
    ? "PROCESSING..."
    : effectiveRunning
    ? "CONNECTED"
    : "JOIN THE COLLECTIVE MIND";

  const btnClasses =
    "font-semibold text-sm px-4 py-2 rounded-full border shadow-[2px_2px_0_#000] " +
    (effectiveRunning
      ? "bg-[#096b2b] text-white border-black"
      : "bg-[#096b2b] hover:bg-lime-600 text-white border-black");

  return (
    <>
      <div className="w-full px-6 py-6 flex justify-between items-center bg-[#000000] text-white">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-extrabold text-white px-2 py-[2px]">
            Dashboard
          </h1>

          <div className="flex items-center gap-2 border border-black rounded-full px-2 py-[10px] bg-white">
            <div className="text-white font-medium text-sm px-3 py-1">
              ⓘ Grow your earnings
            </div>
            <button
              onClick={() => setIsShareOpen(true)}
              className="bg-[#096b2b] text-white font-bold text-sm px-4 py-1 rounded-full border border-black"
            >
              SHARE WITH FRIENDS
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => onToggleNetwork?.()}
            disabled={isProcessing}
            className={btnClasses}
          >
            {label}
          </button>

          <p className="text-xl font-semibold text-white">
            Hello,{" "}
            <span className="font-extrabold">
              {account ? account.slice(0, 6) : "user"}
            </span>
            !
          </p>

          <img
            src="/img/avatar.png"
            alt="avatar"
            className="w-12 h-12 rounded-full bg-[#0cbb3a] border border-black shadow-[2px_2px_0_#000] cursor-pointer"
            onClick={() => setIsProfileOpen(true)}
          />
        </div>
      </div>

      {/* Profile popup (tu componente existente) */}
      {isProfileOpen && (
        <ProfilePopup
          user={{
            username: "luisanchezrd",
            email: "nxpst7@gmail.com",
          }}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {/* Share popup */}
      {isShareOpen && (
        <ShareModal
          referralLink={referralLink}
          onClose={() => setIsShareOpen(false)}
        />
      )}
    </>
  );
}

/* -----------------------------
   Share Modal (replica diseño)
-------------------------------- */
function ShareModal({
  referralLink,
  onClose,
}: {
  referralLink: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const shareText =
    "Join me on Jharvi — earn together! Sign up with my link:";
  const encodedLink = encodeURIComponent(referralLink);
  const encodedText = encodeURIComponent(shareText + " " + referralLink);

  const buttons = [
    {
      name: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedText}`,
      icon: (
        <span className="text-3xl font-black leading-none tracking-tight">𝕏</span>
      ),
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-8 h-8">
          <path
            d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 4.99 3.65 9.13 8.42 9.94v-7.03H7.9v-2.9h2.38V9.41c0-2.35 1.4-3.64 3.54-3.64 1.03 0 2.1.18 2.1.18v2.31h-1.18c-1.16 0-1.52.72-1.52 1.46v1.75h2.59l-.41 2.9h-2.18v7.03c4.77-.81 8.42-4.95 8.42-9.94z"
            fill="currentColor"
          />
        </svg>
      ),
    },
    {
      name: "Telegram",
      href: `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-8 h-8">
          <path
            d="M9.04 15.52 8.9 19.6c.36 0 .52-.16.7-.36l1.68-1.6 3.48 2.56c.64.36 1.08.16 1.24-.6l2.24-10.52v-.04c.2-.96-.36-1.32-.98-1.08L4.6 10.32c-.94.36-.92.88-.16 1.12l3.84 1.2 8.92-5.6-7.16 6.48z"
            fill="currentColor"
          />
        </svg>
      ),
    },
    {
      name: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-8 h-8">
          <path
            d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4zM8 8h3.8v2.05h.05c.53-1 1.84-2.05 3.8-2.05 4.06 0 4.8 2.67 4.8 6.14V23h-4v-6.67c0-1.59-.03-3.64-2.22-3.64-2.22 0-2.56 1.73-2.56 3.52V23H8z"
            fill="currentColor"
          />
        </svg>
      ),
    },
    {
      name: "WhatsApp",
      href: `https://api.whatsapp.com/send?text=${encodedText}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-8 h-8">
          <path
            d="M20.52 3.48A11.94 11.94 0 0 0 12.01 0C5.39 0 .02 5.37.02 11.98c0 2.11.55 4.18 1.6 6.02L0 24l6.16-1.6a12 12 0 0 0 5.84 1.49h.01c6.61 0 11.98-5.37 11.98-11.99.01-3.2-1.24-6.21-3.47-8.44zm-8.51 18.4c-1.83 0-3.62-.49-5.18-1.41l-.37-.22-3.66.95.98-3.56-.24-.37A9.96 9.96 0 1 1 21.97 12c0 5.5-4.47 9.97-9.96 9.97zm5.6-7.47c-.3-.15-1.77-.87-2.04-.97-.27-.1-.46-.15-.65.15-.19.3-.75.97-.92 1.16-.17.19-.34.22-.63.07-.3-.15-1.26-.46-2.4-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.34.44-.52.15-.17.19-.3.3-.5.1-.19.05-.37-.02-.52-.07-.15-.65-1.57-.89-2.15-.23-.56-.47-.49-.65-.5h-.56c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.42 0 1.42 1.03 2.79 1.17 2.98.15.19 2.03 3.1 4.91 4.35.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.12.56-.08 1.77-.72 2.03-1.42.26-.7.26-1.3.18-1.42-.08-.12-.27-.19-.57-.34z"
            fill="currentColor"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-black bg-white text-white shadow-[6px_6px_0_#000] overflow-hidden">
        {/* header */}
        <div className="px-6 py-4 border-b border-black/20 flex items-center justify-between">
          <h3 className="text-2xl font-extrabold">Share With Friends</h3>
          <button
            onClick={onClose}
            className="text-white text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          <p className="text-white mb-5">
            Jharvi works better when your friends join too!
          </p>

          {/* icons row */}
          <div className="flex items-center justify-between max-w-md">
            {buttons.map((b) => (
              <a
                key={b.name}
                href={b.href}
                target="_blank"
                rel="noreferrer"
                className="group w-14 h-14 rounded-full border border-black bg-[#f0ffda] grid place-items-center shadow-[3px_3px_0_#000] hover:translate-y-[1px] transition"
                title={b.name}
              >
                {b.icon}
                <span className="sr-only">{b.name}</span>
              </a>
            ))}
          </div>

          {/* link box + copy */}
          <div className="mt-6 flex items-stretch gap-3">
            <input
              className="flex-1 rounded-xl border border-black bg-white px-4 py-3 shadow-[3px_3px_0_#000] text-sm"
              readOnly
              value={referralLink}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={copy}
              className="rounded-xl bg-[#096b2b] text-white border border-black px-5 py-3 font-extrabold shadow-[3px_3px_0_#000] hover:translate-y-[1px] active:translate-y-[2px]"
            >
              {copied ? "COPIED!" : "COPY"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
