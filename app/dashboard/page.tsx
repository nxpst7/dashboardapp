// /app/dashboard/page.tsx
"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import { Wifi } from "lucide-react";
import JharviMockupBackground from "@/components/JharviMockupBackground";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser"; // ✅ nuevo import

/* Evita SSR para el fondo animado */
const JharviMockupBackgroundNoSSR = dynamic(
  () => import("@/components/JharviMockupBackground"),
  { ssr: false }
);

/* ✅ Supabase del navegador (factory, sin usar envs aquí) */
const supabase = getSupabaseBrowser();

/* 🇩🇴 Corte a las 8:00 PM hora de República Dominicana (UTC-4) */
const RD_UTC_OFFSET = -4;

/* Helper: ISO-2 -> emoji bandera */
function flagEmoji(cc?: string | null) {
  if (!cc) return "";
  const code = cc.toUpperCase();
  if (code.length !== 2) return "";
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return (
    String.fromCodePoint(A + (code.charCodeAt(0) - base)) +
    String.fromCodePoint(A + (code.charCodeAt(1) - base))
  );
}

/** Devuelve el Date (UTC) equivalente al corte de HOY a las 20:00 en RD */
function getTodayCutoffUTC(now: Date) {
  const rdNow = new Date(now.getTime() + RD_UTC_OFFSET * 3600 * 1000);
  const y = rdNow.getUTCFullYear();
  const m = rdNow.getUTCMonth();
  const d = rdNow.getUTCDate();
  return new Date(Date.UTC(y, m, d, 20 - RD_UTC_OFFSET, 0, 0, 0));
}

/** Próximo corte de RD (20:00 RD) estrictamente posterior a "fromMs" */
function nextRDCutoffAfter(fromMs: number) {
  const base = getTodayCutoffUTC(new Date(fromMs)).getTime();
  return fromMs < base ? base : base + 24 * 3600 * 1000;
}

/* ✅ formateo tiempo (movido arriba para uso en saveNow) */
const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${days} day${days !== 1 ? "s" : ""}, ${hrs} hrs, ${mins} mins`;
};

export default function Dashboard() {
  const { account }: { account: string | null } = useAuth();
  const router = useRouter();

  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [dailyPoints, setDailyPoints] = useState<number>(0);
  const [lastResetAt, setLastResetAt] = useState<Date | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [openJoin, setOpenJoin] = useState(false);

  const loadedRef = useRef(false);

  // clave de localStorage por wallet
  const lastTickKeyRef = useRef<string>("jharvi:lastTick:anon");
  useEffect(() => {
    lastTickKeyRef.current = `jharvi:lastTick:${account ?? "anon"}`;
  }, [account]);

  const lastTickRef = useRef<number | null>(null); // última marca de tiempo efectiva usada para acumular

  // ⭐ Estados para "Your Networks"
  const [publicIP, setPublicIP] = useState<string | null>(null);
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [netScore, setNetScore] = useState<number>(0);

  // ⭐ Nombre editable de la red (persistente)
  const [deviceName, setDeviceName] = useState<string>("Untitled Device");
  const [editingName, setEditingName] = useState<boolean>(false);
  const [savingName, setSavingName] = useState<boolean>(false);
  const deviceNameInputRef = useRef<HTMLInputElement | null>(null);

  // ⭐ Estados de geolocalización
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [countryName, setCountryName] = useState<string | null>(null);

  // Refs para evitar updates repetidos en DB
  const prevIpRef = useRef<string | null>(null);
  const prevCCodeRef = useRef<string | null>(null);
  const prevCNameRef = useRef<string | null>(null);

  // === Obtener IP pública ===
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = await r.json();
        if (!abort) setPublicIP(j?.ip ?? null);
      } catch {}
    })();
    return () => {
      abort = true;
    };
  }, []);

  // === Geolocalizar por IP (ipapi.co) ===
  useEffect(() => {
    if (!publicIP) return;
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`https://ipapi.co/${publicIP}/json/`);
        const j = await r.json();
        if (abort) return;
        if (j && !j.error) {
          setCountryCode(j.country_code ?? null);
          setCountryName(j.country_name ?? null);
        } else {
          setCountryCode(null);
          setCountryName(null);
        }
      } catch {
        setCountryCode(null);
        setCountryName(null);
      }
    })();
    return () => {
      abort = true;
    };
  }, [publicIP]);

  // Redirigir si no hay sesión
  useEffect(() => {
    if (!account) router.replace("/");
  }, [account, router]);

  // Verificación de fingerprint
  useEffect(() => {
    const checkFingerprint = async () => {
      if (!account) return;
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      const currentFingerprint = result.visitorId;

      const { data, error } = await supabase
        .from("users")
        .select("fingerprint")
        .eq("wallet", account)
        .single();

      if (error) {
        console.error("Error fetching fingerprint:", error);
        return;
      }
      if (data && data.fingerprint !== currentFingerprint) {
        alert("Acceso denegado: este dispositivo no está autorizado.");
        router.replace("/");
      }
    };
    checkFingerprint();
  }, [account, router]);

  // ⬇️ Carga inicial (incluye device_name + last_seen_at + session_started_at)
  useEffect(() => {
    if (!account || loadedRef.current) return;

    (async () => {
      const { data, error, status } = await supabase
        .from("users")
        .select(`
          total_points,
          daily_points,
          last_reset_at,
          last_ip,
          country_code,
          country_name,
          time_connected_ms,
          session_elapsed_ms,
          session_elapsed_human,
          session_started_at,
          session_is_running,
          last_seen_at,
          device_name
        `)
        .eq("wallet", account)
        .maybeSingle();

      if (error) {
        console.error("load points error:", error, { status });
        return;
      }

      const now = new Date();

      if (!data) {
        const insertPayload: any = {
          wallet: account,
          total_points: 0,
          daily_points: 0,
          last_reset_at: now.toISOString(),
          time_connected_ms: 0,
          device_name: "Untitled Device",
          last_seen_at: now.toISOString(),
        };
        if (publicIP) insertPayload.last_ip = publicIP;
        if (countryCode) insertPayload.country_code = countryCode;
        if (countryName) insertPayload.country_name = countryName;

        const { error: insErr }: any = await supabase.from("users").insert([insertPayload]);
        if (insErr) {
          if (insErr.code === "23505") {
            const { data: again } = await supabase
              .from("users")
              .select(
                "total_points, daily_points, last_reset_at, last_ip, country_code, country_name, time_connected_ms, device_name, last_seen_at, session_started_at, session_is_running"
              )
              .eq("wallet", account)
              .single();
            if (again) {
              setTotalPoints(Number(again.total_points ?? 0));
              setDailyPoints(Number(again.daily_points ?? 0));
              setLastResetAt(again.last_reset_at ? new Date(again.last_reset_at) : now);
              setLastSeenAt(again.last_seen_at ? new Date(again.last_seen_at) : null);
              setSessionStartedAt(again.session_started_at ? new Date(again.session_started_at) : null);
              setIsRunning(!!again.session_is_running);
              setDeviceName(again.device_name || "Untitled Device");
              prevIpRef.current = again.last_ip ?? null;
              prevCCodeRef.current = again.country_code ?? null;
              prevCNameRef.current = again.country_name ?? null;
            }
          } else {
            console.error("insert user row error:", insErr);
          }
        } else {
          setTotalPoints(0);
          setDailyPoints(0);
          setLastResetAt(now);
          setLastSeenAt(now);
          setSessionStartedAt(null);
          setDeviceName("Untitled Device");
        }
      } else {
        setTotalPoints(Number(data.total_points ?? 0));
        setDailyPoints(Number(data.daily_points ?? 0));
        setLastResetAt(data.last_reset_at ? new Date(data.last_reset_at) : new Date());
        setLastSeenAt(data.last_seen_at ? new Date(data.last_seen_at) : null);
        setSessionStartedAt(data.session_started_at ? new Date(data.session_started_at) : null);

        const storedMs = Number(data.session_elapsed_ms ?? 0);
        if (data.session_is_running) {
          setSessionStartMs(Date.now() - storedMs);
        } else {
          setSessionStartMs(null);
        }
        setElapsedMs(storedMs);
        setIsRunning(!!data.session_is_running);

        setDeviceName(data.device_name || "Untitled Device");

        prevIpRef.current = data.last_ip ?? null;
        prevCCodeRef.current = data.country_code ?? null;
        prevCNameRef.current = data.country_name ?? null;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      loadedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // ⬇️ Persistir IP/País cuando cambien (y ya cargamos user)
  useEffect(() => {
    if (!account || !loadedRef.current) return;

    const ipChanged = publicIP && publicIP !== prevIpRef.current;
    const ccChanged = countryCode !== prevCCodeRef.current;
    const cnChanged = countryName !== prevCNameRef.current;

    if (!ipChanged && !ccChanged && !cnChanged) return;

    (async () => {
      try {
        const payload: any = {};
        if (ipChanged) payload.last_ip = publicIP;
        if (ccChanged) payload.country_code = countryCode;
        if (cnChanged) payload.country_name = countryName;

        if (Object.keys(payload).length > 0) {
          await supabase.from("users").update(payload).eq("wallet", account);
          if (ipChanged) prevIpRef.current = publicIP!;
          if (ccChanged) prevCCodeRef.current = countryCode ?? null;
          if (cnChanged) prevCNameRef.current = countryName ?? null;
        }
      } catch (e) {
        console.error("save ip/country error:", e);
      }
    })();
  }, [account, publicIP, countryCode, countryName]);

  // ⏰ Corte diario a las 8:00 PM RD (usado por el guardado periódico)
  const maybeRollover = async (now: Date) => {
    if (!account) return;
    const cutoffUTC = getTodayCutoffUTC(now);
    const last = lastResetAt ? new Date(lastResetAt) : new Date(0);
    if (now >= cutoffUTC && last < cutoffUTC) {
      setDailyPoints(0);
      setLastResetAt(now);
      try {
        await supabase
          .from("users")
          .update({
            daily_points: 0,
            last_reset_at: now.toISOString(),
          })
          .eq("wallet", account);
      } catch (e) {
        console.error("rollover save error:", e);
      }
    }
  };

  /* ================ SAVE ROBUSTO (actualizado) ================ */
  const saveNow = async () => {
    if (!account) return;
    if (!loadedRef.current) return;

    try {
      const { data: server, error: readErr, status } = await supabase
        .from("users")
        .select("total_points, daily_points, last_reset_at, session_elapsed_ms, last_seen_at")
        .eq("wallet", account)
        .maybeSingle();

      if (readErr && status !== 406) {
        console.warn("saveNow read warning:", readErr);
      }

      const srvTotal = Number(server?.total_points ?? 0);
      const srvDaily = Number(server?.daily_points ?? 0);
      const srvSessMs = Number(server?.session_elapsed_ms ?? 0);

      const nextTotal = Math.max(srvTotal, totalPoints);
      const nextDaily = Math.max(srvDaily, dailyPoints);

      const localSessMs =
        isRunning && sessionStartMs != null ? Date.now() - sessionStartMs : elapsedMs;
      const nextSessMs = Math.max(srvSessMs, Number.isFinite(localSessMs) ? localSessMs : 0);
      const nextSessHuman = formatDuration(nextSessMs);

      const nextResetAtISO = (lastResetAt ?? new Date()).toISOString();
      const nowISO = new Date().toISOString();

      const { error: writeErr } = await supabase
        .from("users")
        .update({
          total_points: nextTotal,
          daily_points: nextDaily,
          last_reset_at: nextResetAtISO,
          session_elapsed_ms: nextSessMs,
          session_elapsed_human: nextSessHuman,
          last_seen_at: nowISO,
        })
        .eq("wallet", account);

      if (writeErr) {
        console.warn("saveNow write warning:", writeErr);
        return;
      }

      setLastSeenAt(new Date(nowISO));
    } catch (e) {
      console.warn("saveNow caught:", e);
    }
  };

  const scheduleSave = () => {
    if (!account) return;
    if (!loadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNow, 5000);
  };

  useEffect(() => {
    scheduleSave();
  }, [totalPoints, dailyPoints, lastResetAt, elapsedMs, isRunning, sessionStartMs]);

  useEffect(() => {
    if (!account) return;
    if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    saveIntervalRef.current = setInterval(saveNow, 30000);
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [account]);

  // persistir inmediatamente al ocultar/cerrar y guardar lastTick
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void saveNow();
        const key = lastTickKeyRef.current;
        const v = String(lastTickRef.current ?? Date.now());
        try {
          localStorage.setItem(key, v);
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [account, totalPoints, dailyPoints, lastResetAt, elapsedMs]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (!account) return;
      void saveNow();
      const key = lastTickKeyRef.current;
      const v = String(lastTickRef.current ?? Date.now());
      try {
        localStorage.setItem(key, v);
      } catch {}
    };
  }, [account, totalPoints, dailyPoints, lastResetAt, elapsedMs]);

  const advanceCounters = (fromMs: number, toMs: number) => {
    if (!isRunning) return fromMs;
    if (toMs <= fromMs) return fromMs;

    let deltaSec = Math.floor((toMs - fromMs) / 1000);
    if (deltaSec <= 0) return toMs;

    let cursor = fromMs;
    let addTotal = 0;

    let resetHappened = false;
    let afterResetSec = 0;
    let localLastResetMs = lastResetAt ? lastResetAt.getTime() : 0;

    while (deltaSec > 0) {
      const nextCut = nextRDCutoffAfter(cursor);
      const toCutoffSec = Math.max(0, Math.floor((nextCut - cursor) / 1000));

      if (toCutoffSec === 0) {
        resetHappened = true;
        afterResetSec = 0;
        localLastResetMs = nextCut;
        cursor = nextCut;
        continue;
      }

      const chunk = Math.min(deltaSec, toCutoffSec);
      addTotal += chunk;
      cursor += chunk * 1000;
      deltaSec -= chunk;

      if (cursor >= nextCut) {
        resetHappened = true;
        afterResetSec = 0;
        localLastResetMs = nextCut;
      } else {
        afterResetSec += chunk;
      }
    }

    setTotalPoints((t) => t + addTotal);
    if (resetHappened) {
      setDailyPoints(afterResetSec);
      setLastResetAt(new Date(localLastResetMs));
    } else {
      setDailyPoints((d) => d + afterResetSec);
    }

    return cursor;
  };

  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) return;
    if (!isRunning) return;
    if (bootstrappedRef.current) return;

    const now = Date.now();
    const key = lastTickKeyRef.current;
    let fromMs: number | null = null;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const v = Number(raw);
        if (Number.isFinite(v) && v > 0) fromMs = v;
      }
    } catch {}

    if (fromMs == null) {
      if (lastSeenAt) fromMs = lastSeenAt.getTime();
      else if (sessionStartedAt) fromMs = sessionStartedAt.getTime();
      else fromMs = now;
    }

    const cursor = advanceCounters(fromMs, now);
    lastTickRef.current = cursor;
    try {
      localStorage.setItem(key, String(cursor));
    } catch {}
    bootstrappedRef.current = true;
  }, [isRunning, lastSeenAt, sessionStartedAt, lastResetAt, loadedRef.current]);

  useEffect(() => {
    if (!isRunning) {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      lastTickRef.current = null;
      return;
    }

    const tick = async () => {
      const nowMs = Date.now();

      if (lastTickRef.current == null) {
        lastTickRef.current = nowMs;
        try {
          localStorage.setItem(lastTickKeyRef.current, String(nowMs));
        } catch {}
        return;
      }

      await maybeRollover(new Date());
      const cursor = advanceCounters(lastTickRef.current, nowMs);
      lastTickRef.current = cursor;
      try {
        localStorage.setItem(lastTickKeyRef.current, String(cursor));
      } catch {}
    };

    tick();
    tickIntervalRef.current = setInterval(tick, 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRunning, lastResetAt]);

  const computeScore = (ms: number, daily: number) => {
    const base = 55 + Math.min(35, daily / 3);
    const wave = 5 * Math.sin(ms / 60000);
    return Math.max(0, Math.min(100, base + wave));
  };

  useEffect(() => {
    if (!isRunning || sessionStartMs == null) {
      setNetScore(0);
      return;
    }
    const id = setInterval(() => {
      const ms = Date.now() - sessionStartMs;
      setElapsedMs(ms);
      setNetScore(computeScore(ms, dailyPoints));
    }, 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionStartMs != null) {
        const ms = Date.now() - sessionStartMs;
        setElapsedMs(ms);
        setNetScore(computeScore(ms, dailyPoints));
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRunning, sessionStartMs, dailyPoints]);

  const handlePrimaryAction = async () => {
    if (!account) {
      alert("Please connect your wallet first.");
      return;
    }

    if (isRunning) {
      setIsProcessing(true);
      try {
        await new Promise((res) => setTimeout(res, 400));
        setIsRunning(false);
        await saveNow();
        await supabase.from("users").update({ session_is_running: false }).eq("wallet", account);
        setSessionStartMs(null);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    const startedAtISO = new Date().toISOString();
    setOpenJoin(true);

    try {
      await supabase
        .from("users")
        .update({
          session_started_at: startedAtISO,
          last_seen_at: startedAtISO,
          session_is_running: true,
        })
        .eq("wallet", account);

      setSessionStartedAt(new Date(startedAtISO));
      lastTickRef.current = Date.now();
      try {
        localStorage.setItem(lastTickKeyRef.current, String(lastTickRef.current));
      } catch {}

      setTimeout(() => {
        void saveNow();
      }, 1000);
    } catch (e) {
      console.error("set session_started_at error:", e);
    }
  };

  const persistDeviceName = async (name: string) => {
    if (!account) return;
    setSavingName(true);
    try {
      await supabase.from("users").update({ device_name: name }).eq("wallet", account);
    } catch (e) {
      console.error("save device_name error:", e);
      alert("Couldn't save the network name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const startEditingName = () => {
    setEditingName(true);
    setTimeout(() => deviceNameInputRef.current?.focus(), 0);
  };

  const finishEditingName = async () => {
    let next = deviceName.trim();
    if (next.length === 0) next = "Untitled Device";
    if (next.length > 48) next = next.slice(0, 48);
    setDeviceName(next);
    setEditingName(false);
    void persistDeviceName(next);
  };

  const onKeyDownName: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditingName(false);
    }
  };

  const rows = [
    {
      status: isRunning ? "Connected" : "Disconnected",
      ip: publicIP ?? "—",
      time: elapsedMs > 0 ? formatDuration(elapsedMs) : "—",
      score: isRunning ? `${netScore.toFixed(0)}%` : "—",
      points: isRunning
        ? dailyPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "0",
    },
  ];

  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      {/* ===== Fondo global con Mockup (versión sin SSR) ===== */}
      <JharviMockupBackgroundNoSSR points={dailyPoints} showSelfNode />

      {/* Sidebar con transparencia forzada */}
      <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
        <Sidebar />
      </div>

      {/* Contenido por encima del mockup */}
      <div className="relative z-10 flex-1 min-h-screen">
        {/* Navbar con transparencia forzada */}
        <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
          <Navbar
            onJoinCollective={() => setOpenJoin(true)}
            onToggleNetwork={handlePrimaryAction}
            isRunning={isRunning}
            isProcessing={isProcessing}
          />
        </div>

        <main className="p-6 -mt-6">
          {/* Aviso translúcido */}
          <div className="bg-black/40 backdrop-blur-sm p-4 rounded-xl text-sm text-white mb-6 max-w-6xl mx-auto border border-white/10">
            Welcome to Phase 1! On the dashboard you will see your earnings. To view your total number of points, simply navigate to the{" "}
            <Link
              href="/rewards"
              className="underline font-bold hover:text-lime-400 transition"
            >
              Rewards tab
            </Link>{" "}
            on the left.
          </div>

          <section className="max-w-6xl mx-auto">
            {/* ⭐ Earnings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Phase 1 Earnings */}
              <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl px-6 py-6 flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-6">
                  <p className="text-sm text-white font-bold">
                    Phase 1 <br /> Earnings:
                  </p>
                </div>

                {/* total + logo juntos */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  <img
                    src="/img/logocircular.png"
                    alt="Leaf Icon"
                    className="w-14 h-14 md:w-14 md:h-14 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] select-none"
                  />
                  <span className="text-5xl font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="mt-6 flex items-start gap-2 text-xs text-gray-200">
                  <span>ⓘ</span>
                  <span>All points will be converted into tokens at the TGE.</span>
                </div>
              </div>

              {/* Jharvi PASS */}
              <div className="bg-black/40 backdrop-blur-sm border border-white/10 text-white rounded-xl px-6 py-6 flex flex-col justify-between relative group">
                <div>
                  <h4 className="text-lg font-semibold mb-2">Jharvi PASS</h4>
                  <p className="text-sm mb-1">
                    Get the <strong>Jharvi Pass</strong> and unlock more benefits.
                  </p>
                </div>

                <button className="mt-4 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full w-fit shadow">
                  Coming Soon
                </button>

                {/* Imagen con efectos */}
                <div className="absolute bottom-0 right-10 w-28 md:w-36">
                  <div className="relative">
                    <motion.img
                      src="/img/pass.png"
                      alt="Jharvi Pass"
                      className="relative z-10 w-full object-contain opacity-90
                                 drop-shadow-[0_0_16px_rgba(16,185,129,0.45)]
                                 transition-transform duration-300 will-change-transform
                                 group-hover:scale-110 group-hover:rotate-2"
                      animate={{ y: [0, -6, 0], rotate: [0, -2, 0] }}
                      transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
                    />

                    {/* OVERLAY por encima de la imagen */}
                    <div className="absolute inset-0 z-30 overflow-hidden rounded-lg pointer-events-none">
                      <span className="pass-shimmer" aria-hidden />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <style jsx>{`
              .pass-shimmer {
                position: absolute;
                top: 0;
                left: -150%;
                width: 65%;
                height: 100%;
                background: linear-gradient(
                  120deg,
                  rgba(255, 255, 255, 0) 0%,
                  rgba(255, 255, 255, 0.55) 35%,
                  rgba(255, 255, 255, 0) 70%
                );
                filter: blur(6px);
                mix-blend-mode: screen;
                opacity: 0.8;
                animation: passShimmer 2.6s ease-in-out infinite;
              }
              .group:hover .pass-shimmer {
                animation-duration: 1.6s;
                opacity: 0.95;
              }
              @keyframes passShimmer {
                0%   { left: -150%; }
                100% { left: 150%; }
              }
            `}</style>

            {/* Your Networks */}
            <div className="mt-8 bg-black/40 backdrop-blur-sm border border-white/10 p-6 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Your Networks</h3>
                <button className="text-sm text-white font-bold underline hover:text-lime-300">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-transparent text-left">
                      <th className="px-4 py-2 text-center">
                        <div className="flex justify-center items-center">
                          <Wifi className="w-5 h-5 text-white" />
                        </div>
                      </th>
                      <th className="px-4 py-2 text-white">Network Name</th>
                      <th className="px-4 py-2 text-white">IP</th>
                      <th className="px-4 py-2 text-white">Time Connected</th>
                      <th className="px-4 py-2 text-white">Network Score</th>
                      <th className="px-4 py-2 text-white">Points Earned</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/30">
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-white/30">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${row.status === "Connected" ? "bg-lime-500" : "bg-red-500"}`} />
                            <span className="font-medium text-white">{row.status}</span>
                          </div>
                        </td>

                        {/* ======== Network Name editable ======== */}
                        <td className="px-4 py-2 text-white font-bold">
                          {!editingName ? (
                            <button
                              className="underline underline-offset-2 decoration-white/60 hover:decoration-lime-300"
                              onClick={startEditingName}
                              title="Click to rename"
                            >
                              {deviceName}
                            </button>
                          ) : (
                            <input
                              ref={deviceNameInputRef}
                              className="px-2 py-1 rounded bg-white text-black border border-black outline-none"
                              value={deviceName}
                              onChange={(e) => setDeviceName(e.target.value)}
                              onBlur={finishEditingName}
                              onKeyDown={onKeyDownName}
                              maxLength={64}
                            />
                          )}
                          <button
                            className="ml-2 opacity-80 hover:opacity-100"
                            onClick={startEditingName}
                            title="Rename"
                            aria-label="Rename network"
                          >
                            ✎
                          </button>
                          {savingName && <span className="ml-2 text-xs text-white/70">saving…</span>}
                        </td>
                        {/* ===================================== */}

                        <td className="px-4 py-2 flex text-white items-center gap-2">
                          <span className="text-lg">{flagEmoji(countryCode)}</span>
                          <span>{row.ip}</span>
                          {countryName ? <span className="text-white/70 ml-1">({countryName})</span> : null}
                        </td>
                        <td className="px-4 py-2 text-white">{row.time}</td>
                        <td className="px-4 py-2 text-white">{row.score}</td>
                        <td className="px-4 py-2">
                          <div className="bg-white/80 text-black border border-black rounded-full px-3 py-1 text-sm font-bold inline-flex items-center gap-1">
                            <img src="/img/logocircular.png" alt="coin" className="w-4 h-4" />
                            {row.points}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Modal: al completar enciende la red */}
      {openJoin && (
        <JoinFlowModal
          wallet={account}
          supabase={supabase}
          onClose={() => setOpenJoin(false)}
          onComplete={() => {
            setIsRunning(true);
            setSessionStartMs(Date.now()); // inicia sesión nueva
            lastTickRef.current = Date.now();
            try {
              localStorage.setItem(lastTickKeyRef.current, String(lastTickRef.current));
            } catch {}
          }}
        />
      )}
    </div>
  );
}

/* ================================
   Modal de flujo (3 pasos)
   ================================ */

function JoinFlowModal({
  wallet,
  supabase,
  onClose,
  onComplete,
}: {
  wallet: string | null;
  supabase: SupabaseClient;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [syncPrefs, setSyncPrefs] = useState({ fitness: false, socials: false, games: false });
  const [loading, setLoading] = useState(false);
  const canContinue = step === 1 ? !!wallet : true;

  const handleContinue = async () => {
    if (step < 3) return setStep((s) => (s + 1) as 1 | 2 | 3);

    try {
      if (!wallet) {
        alert("Please connect your wallet before continuing.");
        return;
      }
      setLoading(true);

      await supabase.from("mindmesh_nodes").upsert({
        wallet,
        prefs: syncPrefs,
        created_at: new Date().toISOString(),
      });

      await supabase.from("mesh_flows").insert({
        wallet,
        contribution_type: "idea",
        amount: 3.5,
        from_node: 0,
        to_node: 1,
      });

      onComplete();
      onClose();
    } catch (e) {
      console.error(e);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-950 text-white overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Join the Collective Mind</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <h4 className="font-semibold">1. Connect your mind</h4>
              <p className="text-sm text-white/70">We will use your current session (wallet + fingerprint).</p>
              <div className="mt-2 text-xs">
                Wallet status:{" "}
                <span className={`px-2 py-1 rounded ${wallet ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {wallet ? "Connected" : "Not connected"}
                </span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h4 className="font-semibold">2. Sync data sources</h4>
              <p className="text-sm text-white/70">Choose what influences your rewards:</p>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  { key: "fitness", label: "Fitness (Strava/Apple Health)" },
                  { key: "socials", label: "Social (X/Twitter, Lens)" },
                  { key: "games", label: "Gaming (Steam/Epic)" },
                  { key: "browsing", label: "Web Browsing (Chrome/Brave)" },
                  { key: "learning", label: "Learning (Coursera/Udemy/Skillshare)" },
                  { key: "content", label: "Content Creation (YouTube/TikTok/Medium)" },
                  { key: "storage", label: "Storage (IPFS/Filecoin/Arweave)" },
                  { key: "research", label: "Research (Arxiv/GitHub/Notion)" },
                  { key: "energy", label: "Energy (Smart Devices/IoT)" },
                ].map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(syncPrefs as any)[opt.key]}
                      onChange={(e) => setSyncPrefs((p) => ({ ...p, [opt.key]: e.target.checked }))}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h4 className="font-semibold">3. Node assignment</h4>
              <p className="text-sm text-white/70">
                We’ll place you as a unique node on the live map and kickstart your $JHARVI flow.
              </p>
              <ul className="text-xs text-white/60 list-disc ml-5 mt-2">
                <li>Node created</li>
                <li>First token flow initialized</li>
                <li>Real-time visualization</li>
              </ul>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-white/60">Step {step} of 3</div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="px-3 py-2 rounded-lg bg-white/10">
                Back
              </button>
            )}
            <button
              onClick={handleContinue}
              disabled={!canContinue || loading}
              className={`px-3 py-2 rounded-lg ${loading ? "bg-white/20" : "bg-emerald-500/20 hover:bg-emerald-500/30"}`}
            >
              {step < 3 ? "Continue" : loading ? "Connecting..." : "Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================
   UI helpers
   ================================ */

function Feature({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-[#096b2b]/40 backdrop-blur-sm border border-white/10 rounded-2xl p-5 text-center">
      <div className="flex justify-center text-white">{icon}</div>
      <h3 className="text-semibold text-lg text-white mb-1">{title}</h3>
      <p className="text-white text-sm">{desc}</p>
    </div>
  );
}
