"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import JharviMockupBackground from "@/components/JharviMockupBackground";
import { supabase } from "@/lib/supabase";

type TaskAction = "follow" | "subscribe" | "retweet";

type UITask = {
  id: string;
  title: string;
  description: string;
  url: string;
  action: TaskAction;
  points: number;
};

const TASKS: UITask[] = [
  { id: "medium", title: "Follow on Medium", description: "Follow our official Medium account to stay updated and earn rewards.", url: "https://medium.com/@jharvi", action: "follow", points: 5000 },
  { id: "followTwitter", title: "Follow on X", description: "Follow our official X account to stay updated and earn rewards.", url: "https://x.com/Jharvi_Official", action: "follow", points: 5000 },
  { id: "retweet", title: "Retweet our pinned post", description: "Help us spread the word by retweeting our pinned X and boost your rewards!", url: "https://x.com/jharvi/status/1234567890", action: "retweet", points: 5000 },
  { id: "inviteFriends", title: "Subscribe Jharvi Telegram", description: "Subscribe our official Telegram channel to stay updated and earn rewards.", url: "https://t.me/Jharvi_announcements", action: "subscribe", points: 5000 },
  { id: "youtube", title: "Subscribe Youtube Channel", description: "Join our official Youtube channel to stay updated and earn rewards.", url: "https://youtube.com/@jharvi", action: "subscribe", points: 5000 },
  { id: "instagram", title: "Follow on Instagram", description: "Follow our official Instagram account to stay updated and earn rewards.", url: "https://instagram.com/jharvi", action: "follow", points: 5000 },
];

function labelForAction(a: TaskAction) {
  if (a === "subscribe") return "Subscribe";
  if (a === "retweet") return "Retweet";
  return "Follow";
}

type UsersRow = {
  wallet: string;
  total_points: number | null;
  completed_tasks: any; // jsonb | text | null
};

export default function Task() {
  const { account } = useAuth();
  const router = useRouter();

  const [points, setPoints] = useState(0);

  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [verifiable, setVerifiable] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const timersRef = useRef<Record<string, NodeJS.Timeout | null>>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!account) router.replace("/");
  }, [account, router]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((t) => t && clearInterval(t));
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPoints((p) => p + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // ---------- Helpers DB ----------

  const parseCompleted = (value: any): string[] => {
    if (Array.isArray(value)) return value as string[];
    if (value == null) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const ensureUserRow = async (wallet: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("wallet,total_points,completed_tasks")
      .eq("wallet", wallet)
      .maybeSingle();

    if (error && (error as any).code !== "PGRST116") {
      console.warn("ensureUserRow read warning:", error);
    }

    if (data) {
      return {
        wallet: data.wallet as string,
        total_points: Number(data.total_points ?? 0),
        completed_tasks: parseCompleted(data.completed_tasks),
      } as UsersRow;
    }

    // si no existe, crea solo columnas que sabemos que existen
    const baseRow = {
      wallet,
      total_points: 0,
      completed_tasks: [],
    };
    const { error: insErr } = await supabase
      .from("users")
      .upsert([baseRow], { onConflict: "wallet", ignoreDuplicates: false });

    if (insErr) throw insErr;

    return baseRow as UsersRow;
  };

  const getCompletedFromDB = async (wallet: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("completed_tasks")
      .eq("wallet", wallet)
      .maybeSingle();

    if (error) {
      console.warn("getCompletedFromDB warning:", error);
      return [];
    }
    return parseCompleted(data?.completed_tasks);
  };

  const markTaskCompleted = async (wallet: string, taskId: string, amount: number) => {
    const row = await ensureUserRow(wallet);
    const already = new Set(parseCompleted(row.completed_tasks));
    if (already.has(taskId)) {
      return { duplicated: true, total: Number(row.total_points ?? 0) };
    }

    const nextCompleted = Array.from(already.add(taskId));
    const nextTotal = Number(row.total_points ?? 0) + amount;

    const { error: updErr } = await supabase
      .from("users")
      .update({
        total_points: nextTotal,
        completed_tasks: nextCompleted,
      })
      .eq("wallet", wallet);

    if (updErr) throw updErr;

    return { duplicated: false, total: nextTotal };
  };

  // Carga inicial de tareas ya hechas
  useEffect(() => {
    const boot = async () => {
      if (!account) return;
      try {
        const done = await getCompletedFromDB(account);
        const map: Record<string, boolean> = {};
        for (const tid of done) map[tid] = true;
        setCompleted(map);
      } catch (e) {
        console.warn("boot completed tasks warn:", e);
      }
    };
    void boot();
  }, [account]);

  // ---------- Lógica UI ----------

  const startCountdown = (taskId: string) => {
    setCountdowns((prev) => ({ ...prev, [taskId]: 60 }));
    if (timersRef.current[taskId]) clearInterval(timersRef.current[taskId]!);

    timersRef.current[taskId] = setInterval(() => {
      setCountdowns((prev) => {
        const next = { ...prev };
        const value = (next[taskId] ?? 0) - 1;
        if (value <= 0) {
          delete next[taskId];
          setVerifiable((v) => ({ ...v, [taskId]: true }));
          if (timersRef.current[taskId]) {
            clearInterval(timersRef.current[taskId]!);
            timersRef.current[taskId] = null;
          }
        } else {
          next[taskId] = value;
        }
        return next;
      });
    }, 1000);
  };

  const handleOpenTask = (task: UITask) => {
    if (completed[task.id]) return;
    window.open(task.url, "_blank", "noopener,noreferrer");
    if (!countdowns[task.id] && !verifiable[task.id]) startCountdown(task.id);
  };

  const handleVerify = async (task: UITask) => {
    if (!account) return;
    if (completed[task.id]) return;

    setIsProcessing((p) => ({ ...p, [task.id]: true }));
    try {
      const res = await markTaskCompleted(account, task.id, task.points);

      setCompleted((c) => ({ ...c, [task.id]: true }));
      setVerifiable((v) => ({ ...v, [task.id]: false }));

      if (res.duplicated) console.warn(`Task "${task.id}" already completed; points not added again.`);
    } catch (e: any) {
      console.error("Verify error (Supabase):", e);
      const code = e?.code || e?.details || "unknown";
      const msg = e?.message || e?.hint || JSON.stringify(e);
      alert(`Couldn't save your task.\nCode: ${code}\nMessage: ${msg}`);
    } finally {
      setIsProcessing((p) => ({ ...p, [task.id]: false }));
    }
  };

  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      <JharviMockupBackground points={points} showSelfNode />

      <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
        <Sidebar />
      </div>

      <div className="relative z-10 flex-1 min-h-screen">
        <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
          <Navbar />
        </div>

        <main className="p-6 mt-0">
          <div className="bg-black/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TASKS.map((task) => {
              const isCompleted = !!completed[task.id];
              const isCounting = countdowns[task.id] !== undefined;
              const secondsLeft = countdowns[task.id] ?? 0;
              const canVerify = !!verifiable[task.id];
              const busy = !!isProcessing[task.id];

              return (
                <div
                  key={task.id}
                  className="border border-white/10 rounded-2xl p-6 bg-black/10 backdrop-blur-sm shadow-[4px_4px_0_rgba(0,0,0,0.6)] flex flex-col items-center transition-all"
                >
                  <div className="flex flex-col items-center w-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-white/10 text-white text-base font-bold px-3 py-1 rounded-full border border-white/20">
                        Quest
                      </span>
                      <span className="bg-emerald-400/20 text-emerald-300 text-base font-bold px-3 py-1 rounded-full border border-emerald-300/30">
                        {task.points}
                      </span>
                    </div>

                    <h3 className="text-xl font-semibold text-white text-center mb-3">{task.title}</h3>
                    <p className="text-white/80 text-sm text-center mb-2">{task.description}</p>

                    {isCompleted ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="w-full bg-green-600/90 hover:bg-green-600 text-white font-semibold flex items-center justify-center gap-2 py-2 rounded-lg">
                        Completed <CheckCircle size={18} />
                      </motion.div>
                    ) : canVerify ? (
                      <Button disabled={busy} className="w-full bg-blue-500 hover:bg-blue-500/90 text-white font-semibold" onClick={() => handleVerify(task)}>
                        {busy ? "Verifying..." : "Verify"}
                      </Button>
                    ) : isCounting ? (
                      <Button disabled className="w-full bg-neutral-700 text-white font-semibold">{`Wait ${secondsLeft}s`}</Button>
                    ) : (
                      <Button className="w-full bg-emerald-500/80 hover:bg-emerald-500 text-black font-semibold" onClick={() => handleOpenTask(task)}>
                        {labelForAction(task.action)}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
