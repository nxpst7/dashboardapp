"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Gift,
  Newspaper,
  Diamond,
  HelpCircle,
  Globe,
  BadgeDollarSign,
  LogOut,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Sidebar({ installed = true }: { installed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={24} /> },
    { key: "task", label: "Task", href: "/task", icon: <BadgeDollarSign size={24} /> },
    { key: "referral", label: "Referral Program", href: "/referrals", icon: <Users size={24} /> },
    { key: "rewards", label: "Rewards", href: "/rewards", icon: <Gift size={24} /> },
    { key: "leaderboard", label: "Leaderboard", href: "", icon: <Newspaper size={24} />, comingSoon: true },
    { key: "mint", label: "Mint", href: "", icon: <Diamond size={24} />, comingSoon: true },
    { key: "website", label: "Website", href: "https://jharvi.com", icon: <Globe size={24} />, isNew: true },
    { key: "faqs", label: "Faqs", href: "/faqs", icon: <HelpCircle size={24} /> },
  ];

  const handleLogout = async () => {
    const confirm = window.confirm("¿Estás seguro de que quieres cerrar sesión?");
    if (!confirm) return;

    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="fixed top-0 left-0 h-screen w-64 bg-[#000000] text-white p-6 flex flex-col transition-colors duration-300">

      {/* Top Section */}
      <div className="flex-1 flex flex-col justify-between">
        {/* Logo */}
        <div>
          <div className="flex items-center mb-10 px-2">
            <img
              src="/img/jharvilogowhite.png"
              alt="Jharvi Logo"
              className="w-12 h-12 dark:hidden"
            />
            <h2 className="text-3xl font-bold ml-1">Jharvi</h2>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1">
            {navItems.map(({ key, label, href, icon, comingSoon, isNew }) => (
              <Link href={href} key={key}>
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-[12px] cursor-pointer transition relative ${
                    pathname === href
                      ? "bg-[#096b2b] font-bold text-lg text-white shadow-[4px_4px_0_#000] border border-black -ml-8 pr-6"
                      : "hover:bg-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {icon}
                    <span>{label}</span>
                  </div>
                  {comingSoon && (
                    <span className="text-xs px-2 py-1 rounded bg-black text-white font-semibold">Coming Soon</span>
                  )}
                  {isNew && (
                    <span className="text-xs px-2 py-1 rounded bg-black text-white font-semibold">New</span>
                  )}
                </div>
              </Link>
            ))}

            {/* Logout Button */}
            <div
              onClick={handleLogout}
              className="flex items-center justify-between px-4 py-3 rounded-[12px] cursor-pointer transition text-white"
            >
              <div className="flex items-center gap-3">
                <LogOut size={24} />
                <span>Logout</span>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
