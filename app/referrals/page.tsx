"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import ClaimRewardPopup from "@/components/ClaimRewardPopup";
import JharviMockupBackground from "@/components/JharviMockupBackground";
import { supabase } from "@/lib/supabase"; // ✅ cliente centralizado
import { useAuth } from "@/app/context/AuthContext"; // ✅ usamos wallet como clave

// ================== Bonus por REFERIDOS (tu lógica original) ==================
type BonusStep = { level: number; need: number; points: number };

const BONUS_STEPS: BonusStep[] = [
  { level: 0, need: 0, points: 0 },
  { level: 1, need: 3, points: 500 },
  { level: 2, need: 5, points: 2000 },
  { level: 3, need: 10, points: 5000 },
  { level: 4, need: 20, points: 15000 },
  { level: 5, need: 50, points: 50000 },
  { level: 6, need: 100, points: 100000 },
  { level: 7, need: 300, points: 500000 },
];

// ================== Tiers por TOTAL_POINTS (automáticos) ==================
type TierStep = { index: number; threshold: number; reward: number; name: string };
const TIER_STEPS: TierStep[] = [
  { index: 1, threshold: 0,        reward: 0,     name: "Beginner" },
  { index: 2, threshold: 5000,     reward: 500,   name: "Iron" },
  { index: 3, threshold: 18000,    reward: 1000,  name: "Bronze" },
  { index: 4, threshold: 94000,    reward: 1800,  name: "Silver" },
  { index: 5, threshold: 302000,   reward: 3000,  name: "Gold" },
  { index: 6, threshold: 940000,   reward: 5000,  name: "Platinum" },
  { index: 7, threshold: 1450000,  reward: 10000, name: "Diamond" },
  { index: 8, threshold: 3200000,  reward: 15000, name: "Epic" },
  { index: 9, threshold: 5600000,  reward: 30000, name: "Master" },
  { index: 10, threshold: 8000000, reward: 50000, name: "Supreme" },
];

const TIER_BAR_MAX = 302000; // barra grande debe terminar en 302,000 (Tier 5)

export default function ReferralProgram() {
  const { account } = useAuth(); // ✅ wallet actual
  const [showPopup, setShowPopup] = useState(false);
  const [showClaimPopup, setShowClaimPopup] = useState(false);

  const [referralsCount, setReferralsCount] = useState(0); // >= 100h
  const [pendingCount, setPendingCount] = useState(0);     // < 100h
  const [loadingRefs, setLoadingRefs] = useState(false);

  // Config de columna "referred_by"
  const REFERRED_BY_COLUMN = "referred_by";

  // ====== estado puntos/claim REFERIDOS ======
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState<number>(0);      // <- desde users.total_points
  const [referralPoints, setReferralPoints] = useState<number>(0);
  const [claimedLevel, setClaimedLevel] = useState<number>(0);    // último bonus de referidos reclamado

  // ====== estado Tiers automáticos ======
  const [claimedTier, setClaimedTier] = useState<number>(0);       // último tier ya otorgado (auto)
  const awardingTierRef = useRef<boolean>(false);                  // evita carreras/duplicados
  const [tierPointsAwarded, setTierPointsAwarded] = useState<number>(0); // opcional

  // 🔎 Parser robusto para session_elapsed_human (para tus referidos)
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

  // 📥 Carga principal (por wallet)
  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoadingRefs(true);
        if (!account) {
          setReferralCode(null);
          setPendingCount(0);
          setReferralsCount(0);
          setReferralPoints(0);
          setTotalPoints(0);
          setClaimedTier(0);
          setTierPointsAwarded(0);
          return;
        }

        // 1) Lee TU fila por wallet (igual que en dashboard)
        const { data: meRow, error: meErr } = await supabase
          .from("users")
          .select("referral_code, total_points, referral_points, referral_bonus_level, tier_level_claimed, tier_points, wallet")
          .eq("wallet", account)
          .maybeSingle();

        if (meErr) throw meErr;

        setReferralCode(meRow?.referral_code ?? null);
        setTotalPoints(Number(meRow?.total_points ?? 0));
        setReferralPoints(Number(meRow?.referral_points ?? 0));
        setClaimedLevel(Number(meRow?.referral_bonus_level ?? 0));
        setClaimedTier(Number(meRow?.tier_level_claimed ?? 0));
        setTierPointsAwarded(Number(meRow?.tier_points ?? 0));

        // 2) Si no tienes referral_code aún, no hay filas para contar
        if (!meRow?.referral_code) {
          setPendingCount(0);
          setReferralsCount(0);
          return;
        }

        // 3) Busca referidos por tu código
        const { data: referredRows, error: refErr } = await supabase
          .from("users")
          .select(`wallet, ${REFERRED_BY_COLUMN}, session_elapsed_human`)
          .eq(REFERRED_BY_COLUMN, meRow.referral_code);

        if (refErr) throw refErr;

        const rows = referredRows ?? [];
        let pending = 0;
        let completed = 0;
        for (const r of rows) {
          const h = parseHours((r as any).session_elapsed_human);
          if (h >= 100) completed += 1;
          else pending += 1;
        }
        setPendingCount(pending);
        setReferralsCount(completed);
      } catch (e) {
        console.error("[Referrals] load error:", e);
        setPendingCount(0);
        setReferralsCount(0);
      } finally {
        setLoadingRefs(false);
      }
    };
    loadAll();
  }, [account]);

  // =================== LÓGICA: BONUS por REFERIDOS (tu UI original) ===================
  const { currentLevel, nextLevel, referralsLeft, segmentProgressPct } = useMemo(() => {
    let current = BONUS_STEPS[0];
    for (const step of BONUS_STEPS) {
      if (referralsCount >= step.need) current = step;
    }
    const nxt = BONUS_STEPS.find((s) => s.need > referralsCount) || null;
    const prevNeed = current.need;
    const nextNeed = nxt ? nxt.need : current.need;
    let progress = 1;
    if (nxt) {
      const span = Math.max(nextNeed - prevNeed, 1);
      progress = Math.min(Math.max((referralsCount - prevNeed) / span, 0), 1);
    }
    const left = nxt ? Math.max(nextNeed - referralsCount, 0) : 0;
    return {
      currentLevel: current,
      nextLevel: nxt,
      referralsLeft: left,
      segmentProgressPct: Math.round(progress * 100),
    };
  }, [referralsCount]);

  const claimableLevel = useMemo(() => {
    let topReached = BONUS_STEPS[0].level;
    for (const s of BONUS_STEPS) {
      if (referralsCount >= s.need) topReached = s.level;
    }
    return topReached > claimedLevel ? topReached : 0;
  }, [referralsCount, claimedLevel]);

  const claimablePoints = useMemo(() => {
    if (claimableLevel <= 0) return 0;
    const step = BONUS_STEPS.find((s) => s.level === claimableLevel);
    return step?.points ?? 0;
  }, [claimableLevel]);

  const upcomingBonusLabel = nextLevel ? `${nextLevel.level}` : "—";
  const upcomingBonusPoints = nextLevel ? nextLevel.points : 0;
  const referralsLeftLabel = nextLevel
    ? `Referrals Left To Bonus ${nextLevel.level}: ${referralsLeft}`
    : "All bonuses completed 🎉";

  const claimEnabled = claimableLevel > 0;

  const handleOpenClaim = () => {
    if (claimEnabled) setShowClaimPopup(true);
  };

  const handleConfirmClaim = async () => {
    try {
      if (!account) return;
      if (claimableLevel <= 0) return;
      const step = BONUS_STEPS.find((s) => s.level === claimableLevel);
      if (!step) return;

      const addPts = step.points;

      // lee totales frescos
      const { data: me, error: meErr } = await supabase
        .from("users")
        .select("total_points, referral_points, referral_bonus_level")
        .eq("wallet", account)
        .maybeSingle();

      if (meErr) throw meErr;

      const currTotal = Number(me?.total_points ?? 0);
      const currRef = Number(me?.referral_points ?? 0);

      const { error: updErr } = await supabase
        .from("users")
        .update({
          total_points: currTotal + addPts,
          referral_points: currRef + addPts,
          referral_bonus_level: claimableLevel,
        })
        .eq("wallet", account);

      if (updErr) throw updErr;

      setTotalPoints((v) => v + addPts);
      setReferralPoints((v) => v + addPts);
      setClaimedLevel(claimableLevel);
      setShowClaimPopup(false);
    } catch (e) {
      console.error("[Claim] error:", e);
    }
  };

  // =================== LÓGICA: Tiers automáticos por total_points ===================
  const reachedTier = useMemo(() => {
    let reached = 0;
    for (const t of TIER_STEPS) {
      if (totalPoints >= t.threshold) reached = t.index;
    }
    return reached; // 0..10
  }, [totalPoints]);

  useEffect(() => {
    if (!account) return;
    if (awardingTierRef.current) return;
    if (reachedTier <= claimedTier) return;

    awardingTierRef.current = true;
    (async () => {
      try {
        // Relee del server para evitar condiciones de carrera
        const { data: me, error: meErr } = await supabase
          .from("users")
          .select("total_points, tier_level_claimed, tier_points")
          .eq("wallet", account)
          .maybeSingle();

        if (meErr) throw meErr;

        const srvTotal = Number(me?.total_points ?? 0);
        const srvClaimed = Number(me?.tier_level_claimed ?? 0);
        const srvTierPoints = Number(me?.tier_points ?? 0);

        // Recalcula "alcanzado" con el total del server
        let srvReached = 0;
        for (const t of TIER_STEPS) {
          if (srvTotal >= t.threshold) srvReached = t.index;
        }
        if (srvReached <= srvClaimed) {
          setClaimedTier(srvClaimed);
          setTierPointsAwarded(srvTierPoints);
          awardingTierRef.current = false;
          return;
        }

        // Suma recompensas entre (srvClaimed, srvReached]
        const addPts = TIER_STEPS
          .filter((t) => t.index > srvClaimed && t.index <= srvReached)
          .reduce((sum, t) => sum + t.reward, 0);

        const nextTotal = srvTotal + addPts;
        const nextTierPoints = srvTierPoints + addPts;

        const { error: updErr } = await supabase
          .from("users")
          .update({
            total_points: nextTotal,
            tier_level_claimed: srvReached,
            tier_points: nextTierPoints,
          })
          .eq("wallet", account);

        if (updErr) throw updErr;

        setTotalPoints(nextTotal);
        setClaimedTier(srvReached);
        setTierPointsAwarded(nextTierPoints);
      } catch (e) {
        console.error("[Tier auto-award] error:", e);
      } finally {
        awardingTierRef.current = false;
      }
    })();
  }, [account, reachedTier, claimedTier]);

  // =================== Barra grande (primeros 4 tiers) ===================
  // ⚠️ Mapeo NO LINEAL para alinear 5k/18k/94k/302k con tus marcas 18/40/60/100
  const tierBarPct = useMemo(() => {
    const anchors = [
      { pts: 0,       pct: 0   },
      { pts: 5000,    pct: 18  },
      { pts: 18000,   pct: 40  },
      { pts: 94000,   pct: 60  },
      { pts: 302000,  pct: 100 },
    ] as const;

    const p = Math.max(0, Math.min(totalPoints, TIER_BAR_MAX));
    if (p <= anchors[0].pts) return anchors[0].pct;
    if (p >= anchors[anchors.length - 1].pts) return anchors[anchors.length - 1].pct;

    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (p >= a.pts && p <= b.pts) {
        const frac = (p - a.pts) / (b.pts - a.pts);
        return a.pct + frac * (b.pct - a.pct);
      }
    }
    return 0;
  }, [totalPoints]);

  // =================== Tiers (UI de lista emergente) ===================
  const tiersData = useMemo(
    () => [
      { name: "Beginner",  color: "bg-white", textColor: "text-black", image: "/img/jharvi.png",         points: "0+ Points" },
      { name: "Iron",      color: "bg-white", textColor: "text-black", image: "/img/jharvi-iron.png",     points: "5,000+ Points" },
      { name: "Bronze",    color: "bg-white", textColor: "text-black", image: "/img/jharvi-bronze.png",   points: "18,000+ Points" },
      { name: "Silver",    color: "bg-white", textColor: "text-black", image: "/img/jharvi-silver.png",   points: "94,000+ Points" },
      { name: "Gold",      color: "bg-white", textColor: "text-black", image: "/img/jharvi-gold.png",     points: "302,000+ Points" },
      { name: "Platinum",  color: "bg-white", textColor: "text-black", image: "/img/jharvi-platinum.png", points: "940,000+ Points" },
      { name: "Diamond",   color: "bg-white", textColor: "text-black", image: "/img/jharvi-diamond.png",  points: "1,450,000+ Points" },
      { name: "Epic",      color: "bg-white", textColor: "text-black", image: "/img/jharvi-epic.png",     points: "3,200,000+ Points" },
      { name: "Master",    color: "bg-white", textColor: "text-black", image: "/img/jharvi-master.png",   points: "5,600,000+ Points" },
      { name: "Supreme",   color: "bg-white", textColor: "text-black", image: "/img/jharvi-supreme.png",  points: "8,000,000+ Points" },
    ],
    []
  );

  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      {/* ===== Fondo global con mockup a pantalla completa ===== */}
      <JharviMockupBackground points={referralsCount} showSelfNode />

      {/* Sidebar translúcido */}
      <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
        <Sidebar />
      </div>

      {/* Contenido sobre el mockup */}
      <div className="relative z-10 flex-1 min-h-screen">
        {/* Navbar translúcido */}
        <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
          <Navbar />
        </div>

        <div className="p-6 -mt-12">
          {/* Referral Statistics Cards */}
          <div className="mt-8 px-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
            {/* Card única - Puntos y Referencias */}
            <div className="bg-black/10 backdrop-blur-sm border border-white/10 shadow-[4px_4px_0_rgba(0,0,0,0.6)] px-4 py-6 rounded-xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                {/* Izquierda - Points */}
                <div className="bg-black/20 border border-white/10 rounded-xl p-2 flex flex-col items-center justify-center w-[70%]">
                  <p className="text-xs font-semibold text-white mb-2 text-center">
                    Phase 1 Referral<br />Points:
                  </p>
                  <div className="flex items-center gap-2 text-3xl font-bold text-white mb-2">
                    <img src="/img/logocircular.png" alt="Points Icon" className="w-8 h-8" />
                    {referralPoints.toLocaleString()}
                  </div>
                </div>

                {/* Derecha - Referrals */}
                <div className="bg-black/20 border border-white/10 rounded-xl p-4 ml-4 w-[30%] flex flex-col items-center justify-center">
                  <p className="text-xs font-semibold text-white mb-2 text-center">Referrals:</p>
                  <div className="flex items-center gap-2 text-2xl font-bold text-white">
                    <UserPlus className="w-6 h-6" />
                    {loadingRefs ? "…" : referralsCount}
                  </div>
                </div>
              </div>

              {/* Línea de texto - Pending Referrals */}
              <div className="text-base text-white font-semibold mt-2 ml-1 flex items-center gap-1">
                <span>Pending Referrals:</span>
                <span className="font-bold">{loadingRefs ? "…" : pendingCount}</span>
                <span
                  className="text-white/80 cursor-pointer"
                  title="Referrals that have reached 100hrs of uptime."
                >
                  ⓘ
                </span>
              </div>
            </div>

            {/* Card 2 - Tier Progress (por referidos, TU UI) */}
            <div className="bg-black/10 backdrop-blur-sm border border-white/10 shadow-[4px_4px_0_rgba(0,0,0,0.6)] p-6 rounded-xl relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xs font-bold text-white mb-1 flex items-center gap-2">
                    <div className="w-10 h-12 rounded-full bg-lime-400 border-4 border-black shadow-[2px_2px_0_#000] flex items-center justify-center z-30">
                      <img src="/img/jharvi.png" alt="Tier I" className="w-12 h-12" />
                    </div>
                    {/* Bonus actual */}
                    Bonus:{" "}
                    <span className="bg-black/40 px-2 py-1 rounded font-bold text-white border border-white/10">
                      {currentLevel.level}
                    </span>
                  </h2>

                  <p className="text-xs text-white font-medium">
                    {referralsLeftLabel}
                  </p>
                </div>

                <div className="text-right">
                  <button
                    className={`px-5 py-1 rounded-full font-bold text-sm shadow border ${
                      claimEnabled
                        ? "bg-black/40 border-white/10 text-white hover:brightness-110"
                        : "bg-black/20 border-white/10 text-white/60 cursor-not-allowed"
                    }`}
                    onClick={() => handleOpenClaim()}
                    disabled={!claimEnabled}
                  >
                    CLAIM
                  </button>

                  <div className="mt-1 text-[10px] text-right text-white/80 leading-tight">
                    {claimEnabled ? (
                      <span className="bg-white text-black px-2 py-[2px] rounded-md font-semibold">
                        Reward Ready: {claimablePoints.toLocaleString()} pts
                      </span>
                    ) : (
                      <span className="bg-white/70 text-black px-2 py-[2px] rounded-md font-semibold">
                        No Rewards To Claim Yet.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar (por referidos) */}
              <div className="top-2 relative mt-0 h-3 bg-white/30 rounded-full border border-white/20">
                <div
                  className="absolute top-0 left-0 h-full bg-lime-400 rounded-full"
                  style={{ width: `${segmentProgressPct}%` }}
                />
                <div className="absolute -top-5 right-0 z-20">
                  <div className="w-10 h-12 rounded-full bg-lime-400 border-4 border-black shadow-[2px_2px_0_#000] flex items-center justify-center">
                    <img src="/img/jharvi-iron.png" alt="Tier End Icon" className="w-12 h-12" />
                  </div>
                </div>
              </div>

              {/* Footer bonus tier */}
              <div className="mt-8 flex justify-between items-center">
                <p className="text-xs font-semibold text-white">Upcoming Bonus: {upcomingBonusLabel}</p>
                <div className="flex items-center gap-2 bg-white/80 px-3 py-1 rounded-full border border-black text-black font-bold text-sm">
                  <img src="/img/logocircular.png" alt="Leaf Icon" className="w-4 h-4" />
                  {upcomingBonusPoints.toLocaleString()} Points
                </div>
              </div>
            </div>
          </div>

          {/* Encabezado externo */}
          <div className="flex justify-between items-center mx-10 mt-6 mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <span className="bg-black/40 text-white font-semibold px-3 py-1 rounded-lg flex items-center gap-2 border border-white/10">
                🏆 Jharvi Tiers
              </span>
            </h2>
            <button
              className="bg-black/40 text-xl font-bold text-white/90 hover:text-white"
              onClick={() => setShowPopup(true)}
            >
              Next Tiers
            </button>
          </div>

          {/* Recuadro principal (BARRA de Tiers por TOTAL_POINTS) */}
          <div className="mx-10 bg-[#096b2b]/40 backdrop-blur-sm border border-white/10 shadow-[0px_4px_0px_rgba(0,0,0,0.6)] rounded-xl p-2 relative">
            {/* Contenedor con borde para la barra */}
            <div className="absolute top-[140px] left-[calc(4%+28px)] right-[calc(2%+28px)] z-10">
              <div className="h-4 w-full bg-white/30 rounded-full border border-white/20 relative">
                {/* 🔥 mapeo NO LINEAL con anclas 0→18→40→60→100 */}
                <div
                  className="h-full bg-lime-400 rounded-full transition-all duration-700 ease-in-out"
                  style={{ width: `${tierBarPct}%` }}
                ></div>
              </div>
            </div>

            {/* Puntos intermedios (posiciones visuales fijas) */}
            <div className="absolute top-[160px] left-[18%] -translate-x-1/2 text-center z-20">
              <p className="text-sm font-semibold text-white">5,000 Points</p>
            </div>
            <div className="absolute top-[160px] left-[40%] -translate-x-1/2 text-center z-20">
              <p className="text-sm font-semibold text-white">18,000 Points</p>
            </div>
            <div className="absolute top-[160px] left-[60%] -translate-x-1/2 text-center z-20">
              <p className="text-sm font-semibold text-white">94,000 Points</p>
            </div>
            <div className="absolute top-[160px] left-[84%] -translate-x-1/2 text-center z-20">
              <p className="text-sm font-semibold text-white">302,000 Points</p>
            </div>

            {/* Tiers (tu UI) */}
            <div className="flex justify-between items-end relative z-20 mt-4">
              {/* Tier I */}
              <div className="flex flex-col items-center w-5/5 text-center">
                <div className="flex items-center gap-2 text-white font-bold text-xl mb-1">
                  <img src="/img/logocircular.png" alt="Tier I Coin" className="w-6 h-6" />
                  <span>0</span>
                </div>
                <div className="bg-black/10 border border-white/10 text-xs font-bold px-2 py-1 rounded my-1 text-white">
                  Tier I: Beginner
                </div>
                <div className="w-16 h-192 flex items-center justify-center my-0 z-30">
                  <img src="/img/jharvi.png" alt="Tier I" className="w-32 h-32" />
                </div>
              </div>

              {/* Tier II */}
              <div className="flex flex-col items-center w-5/5 text-center">
                <div className="flex items-center gap-2 text-white font-bold text-xl mb-1">
                  <img src="/img/logocircular.png" alt="Tier II Coin" className="w-6 h-6" />
                  <span>500</span>
                </div>
                <div className="bg-black/10 border border-white/10 text-xs font-bold px-2 py-1 rounded my-1 text-white">
                  Tier II: Iron
                </div>
                <div className="w-16 h-192 flex items-center justify-center my-0 z-30">
                  <img src="/img/jharvi-iron.png" alt="Tier II" className="w-32 h-32" />
                </div>
              </div>

              {/* Tier III */}
              <div className="flex flex-col items-center w-5/5 text-center">
                <div className="flex items-center gap-2 text-white font-bold text-xl mb-1">
                  <img src="/img/logocircular.png" alt="Tier III Coin" className="w-6 h-6" />
                  <span>1.k</span>
                </div>
                <div className="bg-black/10 border border-white/10 text-xs font-bold px-2 py-1 rounded my-1 text-white">
                  Tier III: Bronze
                </div>
                <div className="w-16 h-192 flex items-center justify-center my-0 z-30">
                  <img src="/img/jharvi-bronze.png" alt="Tier III" className="w-32 h-32" />
                </div>
              </div>

              {/* Tier IV */}
              <div className="flex flex-col items-center w-5/5 text-center">
                <div className="flex items-center gap-2 text-white font-bold text-xl mb-1">
                  <img src="/img/logocircular.png" alt="Tier IV Coin" className="w-6 h-6" />
                  <span>1.8k</span>
                </div>
                <div className="bg-black/10 border border-white/10 text-xs font-bold px-2 py-1 rounded my-1 text-white">
                  Tier IV: Silver
                </div>
                <div className="w-16 h-192 flex items-center justify-center my-0 z-30">
                  <img src="/img/jharvi-silver.png" alt="Tier IV" className="w-32 h-32" />
                </div>
              </div>

              {/* Tier V */}
              <div className="flex flex-col items-center w-5/5 text-center">
                <div className="flex items-center gap-2 text-white font-bold text-xl mb-1">
                  <img src="/img/logocircular.png" alt="Tier V Coin" className="w-6 h-6" />
                  <span>3.0k</span>
                </div>
                <div className="bg-black/10 border border-white/10 text-xs font-bold px-2 py-1 rounded my-1 text-white">
                  Tier V: Gold
                </div>
                <div className="w-16 h-192 flex items-center justify-center my-0 z-30">
                  <img src="/img/jharvi-gold.png" alt="Tier V" className="w-32 h-32" />
                </div>
              </div>
            </div>
          </div>

          {/* Popup */}
          {showPopup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-[#096b2b] border border-black rounded-2xl shadow-xl w-full max-w-6xl p-2 relative">
                <div className="bg-[#096b2b] p-2 rounded-t-xl border-b border-black">
                  <h2 className="bg-[#096b2b] text-2xl font-bold text-white">List of Tiers</h2>
                </div>

                <p className="text-sm text-white p-4">
                  Uncover the hierarchy of user ranks through a collection of badges that signify different tiers within our community. These badges succinctly outline the various stages of progression.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-2">
                  {tiersData.map((tier, index) => (
                    <div
                      key={index}
                      className={`border border-black rounded-xl p-4 flex flex-col items-center justify-center text-center ${tier.color}`}
                    >
                      <div className={`flex items-center justify-center my-2 z-30`}>
                        <img src={tier.image} alt={tier.name} className="w-24 h-28" />
                      </div>
                      <p className={`text-md font-bold ${tier.textColor}`}>Tier {index + 1}: {tier.name}</p>
                      <p className={`text-sm mt-1 font-semibold ${tier.textColor}`}>{tier.points}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowPopup(false)}
                  className="absolute top-4 right-4 text-white">
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showClaimPopup && (
        <ClaimRewardPopup
          open
          onClose={() => setShowClaimPopup(false)}
          level={claimableLevel}
          points={claimablePoints}
          onConfirm={handleConfirmClaim}
        />
      )}
    </div>
  );
}
