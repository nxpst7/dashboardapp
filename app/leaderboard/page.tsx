"use client";

import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import JharviMockupBackground from "@/components/JharviMockupBackground";

export default function Leaderboard() {
  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      {/* Fondo global con mockup a pantalla completa */}
      <JharviMockupBackground points={50488} />

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

          {/* Top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {[1, 2, 3].map((rank, i) => (
              <div
                key={rank}
                className="bg-black/10 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-black/40 border border-white/10 flex items-center justify-center mb-4 overflow-hidden">
                  <img
                    src="/img/avatar.png"
                    alt="Avatar"
                    className="w-full h-full object-cover rounded-full opacity-90"
                  />
                </div>
                <h3 className="text-white text-xl font-bold">
                  {["00x0...........00x0", "0xx0...........x0x0", "0px0...........00x0"][i]}
                </h3>
                <p className="text-white font-bold text-lg">
                  {["52,834,344.02", "47,364,347.15", "24,978,425.63"][i]} points
                </p>
                <div className="mt-2 bg-black/10 border border-white/10 text-white px-3 py-1 rounded-full inline-block font-bold">
                  #{rank}
                </div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm">
            <table className="min-w-full rounded-xl overflow-hidden">
              <thead className="bg-black/20 text-left text-sm uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-4 text-white/90">Ranking</th>
                  <th className="px-6 py-4 text-white/90">Wallet</th>
                  <th className="px-6 py-4 text-white/90">Points</th>
                  <th className="px-6 py-4 text-white/90">Uptime</th>
                  <th className="px-6 py-4 text-white/90">Referrals</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-t border-white/10 bg-black/10">
                  <td className="px-6 py-4">4</td>
                  <td className="px-6 py-4">00xx...........s9s9</td>
                  <td className="px-6 py-4">21,091,000</td>
                  <td className="px-6 py-4">2400 hours</td>
                  <td className="px-6 py-4">4</td>
                </tr>
                <tr className="border-t border-white/10 bg-black/10">
                  <td className="px-6 py-4">5</td>
                  <td className="px-6 py-4">00xx...........s9s8</td>
                  <td className="px-6 py-4">10,080,000</td>
                  <td className="px-6 py-4">1900 hours</td>
                  <td className="px-6 py-4">0</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
  );
}
