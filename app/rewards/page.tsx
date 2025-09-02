"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import JharviMockupBackground from "@/components/JharviMockupBackground";
import { useAuth } from "@/app/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function ReferralProgram() {
  const { account } = useAuth();
  const router = useRouter();

  const [uptime, setUptime] = useState<string>("—");
  const [phasePoints, setPhasePoints] = useState<number | null>(null);

  useEffect(() => {
    if (!account) {
      router.replace("/");
      return;
    }

    let abort = false;

    const loadData = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("session_elapsed_human, total_points")
        .eq("wallet", account)
        .maybeSingle();

      if (abort) return;

      if (error) {
        console.error("Error loading rewards data:", error);
        setUptime("—");
        setPhasePoints(0);
        return;
      }

      setUptime(data?.session_elapsed_human ?? "—");
      setPhasePoints(Number(data?.total_points ?? 0));
    };

    void loadData();
    const id = setInterval(loadData, 15000); // refresca cada 15s

    return () => {
      abort = true;
      clearInterval(id);
    };
  }, [account, router]);

  const phasePointsStr =
    phasePoints == null
      ? "0"
      : phasePoints.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      {/* ===== Fondo global con mockup a pantalla completa ===== */}
      <JharviMockupBackground points={0} />

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

        <div className="p-6 -mt-6">
          <div className="mt-12 ml-10">
            <h1 className="text-5xl font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              Rewards
            </h1>
          </div>

          {/* Rewards Table Section */}
          <div className="mx-4 md:mx-10 bg-[#096b2b]/40 backdrop-blur-sm border border-white/10 rounded-xl p-4 mt-10 shadow-[0px_4px_0px_rgba(0,0,0,0.6)]">
            {/* Dropdown stage */}
            <div className="flex items-center justify-between mb-4">
              <div className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full text-sm font-semibold shadow-[0px_2px_0px_rgba(0,0,0,0.6)]">
                Stage 1: Capturing The Points
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="bg-white/10 border-b border-white/10">
                    <th className="px-4 py-2 font-semibold text-white/90">Phase</th>
                    <th className="px-4 py-2 font-semibold text-white/90">Start / End Date</th>
                    <th className="px-4 py-2 font-semibold text-white/90">Total Uptime</th>
                    <th className="px-4 py-2 font-semibold text-white/90">Referral Points</th>
                    <th className="px-4 py-2 font-semibold text-white/90">
                      Phase Points <span title="Points earned this epoch">ⓘ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-black/40 border-t border-white/10">
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                      <span className="text-sm">Phase 1</span>{" "}
                      <span className="text-emerald-300 font-semibold">Current</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-white/90 text-sm flex items-center gap-2">
                        🟢 <span>Sept 01, 2025 12:00:00 AM</span>
                      </div>
                      <div className="text-white/90 text-sm flex items-center gap-2 mt-1">
                        🟢 <span>Dec 20, 2025 11:59:59 PM</span>
                      </div>
                    </td>

                    {/* Uptime desde Supabase */}
                    <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                      {uptime}
                    </td>

                    {/* Referral Points (placeholder por ahora) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 bg-[#096b2b]/70 text-white font-bold px-3 py-1 rounded-full border border-white/10 shadow-[1px_1px_0px_rgba(0,0,0,0.6)]">
                        <img src="/img/logocircular.png" alt="Leaf Icon" className="w-4 h-4" />
                        <span>0.00</span>
                      </div>
                    </td>

                    {/* Phase Points desde Supabase (users.total_points) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 bg-[#096b2b]/70 text-white font-bold px-3 py-1 rounded-full border border-white/10 shadow-[1px_1px_0px_rgba(0,0,0,0.6)]">
                        <img src="/img/logocircular.png" alt="Leaf Icon" className="w-4 h-4" />
                        <span>{phasePointsStr}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer text */}
            <p className="text-white/80 text-sm mt-4">
              Every node is critical in our mission to take back control of the internet.
              Contributions to the network are captured every epoch and rewards will be distributed at the end of each stage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
