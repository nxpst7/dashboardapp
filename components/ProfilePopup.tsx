"use client";

import { useEffect, useState } from "react";
import { X, LogOut, User, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/app/context/AuthContext";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Defaults visibles y (ahora) persistibles si faltan
const DEFAULT_USERNAME = "user";
const DEFAULT_EMAIL = "user@gmail.com";

export default function ProfilePopup({ user, onClose }: { user: any; onClose: () => void }) {
  const router = useRouter();
  const { account } = useAuth();

  // edición
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const [newUsername, setNewUsername] = useState<string>(user?.username || DEFAULT_USERNAME);
  const [newEmail, setNewEmail] = useState<string>(user?.email || DEFAULT_EMAIL);

  // “solo una vez”
  const [usernameLocked, setUsernameLocked] = useState<boolean>(false);
  const [emailLocked, setEmailLocked] = useState<boolean>(false);

  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Helpers
  const usernameIsValid = (uname: string) => /^[a-zA-Z0-9_]{3,24}$/.test(uname.trim());
  const emailIsValid = (em: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.trim());
  const last4 = (w?: string | null) => (w ? w.slice(-4).toLowerCase() : Math.random().toString(36).slice(-4));

  // Cargar datos y PERSISTIR defaults si faltan (sin marcar *_changed_at)
  useEffect(() => {
    (async () => {
      try {
        if (!account) {
          setNewUsername(DEFAULT_USERNAME);
          setNewEmail(DEFAULT_EMAIL);
          return;
        }

        // Lee fila del usuario
        const { data, error } = await supabase
          .from("users")
          .select("username, email, username_changed_at, email_changed_at")
          .eq("wallet", account)
          .maybeSingle();

        if (error) {
          console.warn("fetch user row:", error);
          return;
        }

        let u = (data?.username ?? "").trim();
        let e = (data?.email ?? "").trim();

        // === Username default persistente si está vacío ===
        if (!u) {
          let desired = DEFAULT_USERNAME;
          // intenta guardar 'user'
          const { error: updErr1 } = await supabase
            .from("users")
            .update({ username: desired })
            .eq("wallet", account);
          if (updErr1 && (updErr1 as any).code === "23505") {
            // unicidad: cae a user_<last4>
            desired = `${DEFAULT_USERNAME}_${last4(account)}`;
            const { error: updErr2 } = await supabase
              .from("users")
              .update({ username: desired })
              .eq("wallet", account);
            if (updErr2) console.warn("fallback username update:", updErr2);
          }
          u = desired;
        }

        // === Email default persistente si está vacío ===
        if (!e) {
          let desired = DEFAULT_EMAIL;
          const { error: updErr1 } = await supabase
            .from("users")
            .update({ email: desired })
            .eq("wallet", account);
          if (updErr1 && (updErr1 as any).code === "23505") {
            // unicidad: cae a user+<last4>@gmail.com
            desired = `user+${last4(account)}@gmail.com`;
            const { error: updErr2 } = await supabase
              .from("users")
              .update({ email: desired })
              .eq("wallet", account);
            if (updErr2) console.warn("fallback email update:", updErr2);
          }
          e = desired;
        }

        setNewUsername(u || DEFAULT_USERNAME);
        setNewEmail(e || DEFAULT_EMAIL);
        setUsernameLocked(!!data?.username_changed_at);
        setEmailLocked(!!data?.email_changed_at);
      } catch (err) {
        console.warn("load/persist defaults error:", err);
      }
    })();
  }, [account]);

  const handleLogout = async () => {
    const confirmLogout = window.confirm("¿Estás seguro de que deseas cerrar sesión?");
    if (!confirmLogout) return;
    await supabase.auth.signOut();
    router.push("/");
  };

  // ===== GUARDAR USERNAME (una sola vez) =====
  const handleSaveUsername = async () => {
    try {
      if (!account) return;
      if (usernameLocked) {
        alert("El username solo puede cambiarse una vez.");
        setIsUsernameModalOpen(false);
        return;
      }

      const uname = newUsername.trim();

      // Evitar guardar el default global
      if (uname.toLowerCase() === DEFAULT_USERNAME.toLowerCase()) {
        alert("Elige un username personalizado (no 'user').");
        return;
      }
      if (!usernameIsValid(uname)) {
        alert("Username inválido. Usa 3-24 caracteres: letras, números o _.");
        return;
      }

      setSavingUsername(true);

      // Unicidad
      const { count: taken } = await supabase
        .from("users")
        .select("wallet", { count: "exact", head: true })
        .eq("username", uname)
        .neq("wallet", account);
      if ((taken ?? 0) > 0) {
        alert("Ese username ya está en uso.");
        return;
      }

      // Actualizar si aún no tiene cambio registrado
      const { error: updErr, data: updData } = await supabase
        .from("users")
        .update({ username: uname, username_changed_at: new Date().toISOString() })
        .eq("wallet", account)
        .is("username_changed_at", null)
        .select("username, username_changed_at");

      if (updErr) {
        console.error("update username error:", updErr);
        alert("No se pudo actualizar el username.");
        return;
      }

      if (!updData || updData.length === 0) {
        setUsernameLocked(true);
        alert("Tu username ya fue cambiado previamente (solo se permite 1 vez).");
      } else {
        setUsernameLocked(true);
        setNewUsername(uname);
        alert("¡Username actualizado!");
      }
      setIsUsernameModalOpen(false);
    } finally {
      setSavingUsername(false);
    }
  };

  // ===== GUARDAR EMAIL (una sola vez) =====
  const handleSaveEmail = async () => {
    try {
      if (!account) return;
      if (emailLocked) {
        alert("El email solo puede cambiarse una vez.");
        setIsEmailModalOpen(false);
        return;
      }

      const em = newEmail.trim();

      // Evitar guardar el default global
      if (em.toLowerCase() === DEFAULT_EMAIL.toLowerCase()) {
        alert("Ingresa un email personalizado (no 'user@gmail.com').");
        return;
      }
      if (!emailIsValid(em)) {
        alert("Email inválido.");
        return;
      }

      setSavingEmail(true);

      // Unicidad
      const { count: emailTaken } = await supabase
        .from("users")
        .select("wallet", { count: "exact", head: true })
        .eq("email", em)
        .neq("wallet", account);
      if ((emailTaken ?? 0) > 0) {
        alert("Ese email ya está registrado.");
        return;
      }

      // Actualizar si aún no tiene cambio registrado
      const { error: updErr, data: updData } = await supabase
        .from("users")
        .update({ email: em, email_changed_at: new Date().toISOString() })
        .eq("wallet", account)
        .is("email_changed_at", null)
        .select("email, email_changed_at");

      if (updErr) {
        console.error("update email error:", updErr);
        alert("No se pudo actualizar el email.");
        return;
      }

      if (!updData || updData.length === 0) {
        setEmailLocked(true);
        alert("Tu email ya fue cambiado previamente (solo se permite 1 vez).");
      } else {
        setEmailLocked(true);
        setNewEmail(em);
        alert("¡Email actualizado!");
      }
      setIsEmailModalOpen(false);
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <>
      {/* Overlay principal */}
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex justify-center items-center">
        <div className="relative w[360px] w-[360px] rounded-3xl shadow-xl border border-black bg-neutral-950 text-white p-6">
          <button
            onClick={onClose}
            aria-label="Close profile popup"
            className="absolute top-3 right-3 z-[110] bg-[#0cbb3a] border border-black w-8 h-8 rounded-full flex items-center justify-center hover:scale-105 transition"
          >
            <X className="w-5 h-5 pointer-events-none" />
          </button>

          <div className="flex flex-col items-center text-center space-y-2">
            <img src="/img/avatar.png" alt="avatar" className="w-16 h-16 rounded-full border border-black" />

            <div className="font-bold text-lg">{newUsername || DEFAULT_USERNAME}</div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-white">{newEmail || DEFAULT_EMAIL}</span>
              <span className="text-xs bg-[#0cbb3a] text-white font-semibold px-2 py-0.5 rounded-full border border-black">
                No Verified
              </span>
            </div>

            {account && (
              <div className="mt-2 bg-lime-100 text-white border border-black rounded-full px-3 py-2 text-sm font-mono truncate max-w-full">
                {account}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                className={`bg-[#016121] text-white border border-black text-sm font-semibold px-4 py-2 rounded-full shadow-[2px_2px_0_#000] ${
                  usernameLocked ? "opacity-60 cursor-not-allowed" : ""
                }`}
                onClick={() => !usernameLocked && setIsUsernameModalOpen(true)}
                disabled={usernameLocked}
                title={usernameLocked ? "Ya cambiaste tu username una vez" : "Change Username"}
              >
                CHANGE USERNAME
              </button>

              <button
                className={`bg-gray-300 border border-black text-sm font-semibold px-4 py-2 rounded-full shadow-[2px_2px_0_#000] text-white ${
                  emailLocked ? "opacity-60 cursor-not-allowed" : ""
                }`}
                onClick={() => !emailLocked && setIsEmailModalOpen(true)}
                disabled={emailLocked}
                title={emailLocked ? "Ya cambiaste tu email una vez" : "Change Email"}
              >
                CHANGE EMAIL
              </button>
            </div>

            <div className="text-xs mt-2 text-white">
              You can’t change the email of a verified account.
            </div>
          </div>

          <div className="text-xs mt-6 text-center text-white px-4">
            For support please visit the Jharvi Support Agent by clicking the green chat symbol in the bottom right corner of the dashboard. Please refresh your dashboard before opening a ticket.
          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
  <div className="flex gap-3">
    <Link
      href="/faqs"
      className="bg-lime-100 textwhite border border-black px-4 py-1.5 text-sm font-semibold rounded-full shadow-[2px_2px_0_#000]"
    >
      FAQ
    </Link>

    <Link
      href="https://jharvi.com/"
      className="bg-lime-100 text-white border border-black px-4 py-1.5 text-sm font-semibold rounded-full shadow-[2px_2px_0_#000]"
    >
      ABOUT JHARVI
    </Link>
  </div>


            <button onClick={handleLogout} className="flex items-center gap-2 text-white text-sm hover:text-lime-300 mt-2">
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modales */}
      {isUsernameModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm grid place-items-center">
          <div className="relative bg-neutral-950 text-white border border-black rounded-2xl p-6 w-[320px] shadow-[4px_4px_0_#000]">
            <button onClick={() => setIsUsernameModalOpen(false)} aria-label="Close username modal" className="absolute top-3 right-3 text-white z-[130]">
              <X size={18} className="pointer-events-none" />
            </button>

            <div className="text-center mb-4">
              <span className="bg-emerald-500 text-white font-bold py-1 px-3 rounded-full text-sm border border-black">
                Change username
              </span>
            </div>

            <div className="text-white flex items-center border border-black rounded-full bg-white px-3 py-2 mb-4">
              <User size={16} className="text-white mr-2" />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="flex-1 outline-none bg-transparent text-sm text-white placeholder:text-white"
                placeholder="New username"
                maxLength={24}
              />
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={handleSaveUsername}
                disabled={savingUsername}
                className="px-4 py-2 rounded-full bg-gray-300 text-white text-sm font-semibold border border-black shadow-[2px_2px_0_#000] disabled:opacity-60"
              >
                {savingUsername ? "SAVING..." : "SAVE"}
              </button>
              <button
                onClick={() => setIsUsernameModalOpen(false)}
                className="px-4 py-2 rounded-full bg-black text-white text-sm font-semibold border border-black shadow-[2px_2px_0_#000]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm grid place-items-center">
          <div className="relative bg-neutral-950 text-white border border-black rounded-2xl p-6 w-[320px] shadow-[4px_4px_0_#000]">
            <button onClick={() => setIsEmailModalOpen(false)} aria-label="Close email modal" className="absolute top-3 right-3 text-white z-[130]">
              <X size={18} className="pointer-events-none" />
            </button>

            <div className="text-center mb-4">
              <span className="bg-emerald-500 text-white font-bold py-1 px-3 rounded-full text-sm border border-black">
                Change email
              </span>
            </div>

            <div className="text-white flex items-center border border-black rounded-full bg-white px-3 py-2 mb-4">
              <Mail size={16} className="text-white mr-2" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 outline-none bg-transparent text-sm text-white placeholder:text-white"
                placeholder="name@example.com"
              />
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail}
                className="px-4 py-2 rounded-full bg-gray-300 text-white text-sm font-semibold border border-black shadow-[2px_2px_0_#000] disabled:opacity-60"
              >
                {savingEmail ? "SAVING..." : "SAVE"}
              </button>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="px-4 py-2 rounded-full bg-black text-white text-sm font-semibold border border-black shadow-[2px_2px_0_#000]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
