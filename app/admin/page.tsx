"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress as checksum, BrowserProvider } from "ethers";
import { normalizeEvmWallet } from "@/lib/wallet/normalize";

type UserRow = {
  wallet: string;
  role: "user" | "admin";
  is_banned: boolean;
  country_code: string | null;
  total_points: number | null;
  daily_points: number | null;
  last_seen_at: string | null;
  referrals_total: number;
  referrals_completed: number;
  referrals_pending: number;
};

type SortKey =
  | "wallet"
  | "role"
  | "total_points"
  | "daily_points"
  | "country_code"
  | "last_seen_at"
  | "is_banned"
  | "referrals_total"
  | "referrals_completed"
  | "referrals_pending";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function timeAgo(s?: string | null) {
  if (!s) return "—";
  const ms = Date.now() - new Date(s).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
function downloadCSV(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] ?? "";
          const cell =
            typeof v === "string"
              ? `"${v.replace(/"/g, '""')}"`
              : typeof v === "number"
              ? String(v)
              : `"${JSON.stringify(v).replace(/"/g, '""')}"`;
          return cell;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  // Datos
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);

  // Filtros y orden (server-side)
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "user" | "admin">("all");
  const [banned, setBanned] = useState<"all" | "only" | "none">("all");
  const [country, setCountry] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("last_seen_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Paginación (server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 💥 Estado y lógica para el modal de referidos
  const [refOpen, setRefOpen] = useState(false);
  const [refLoading, setRefLoading] = useState(false);
  const [refOwner, setRefOwner] = useState<string | null>(null);
  const [refItems, setRefItems] = useState<
    Array<{ wallet: string; hours: number; last_seen_at: string | null; total_points: number; completed: boolean }>
  >([]);

  async function openRefs(wallet: string) {
    setRefOpen(true);
    setRefOwner(wallet);
    setRefLoading(true);
    try {
      const r = await fetch(`/api/admin/referrals?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
      const j = await r.json();
      setRefItems(j.items || []);
    } finally {
      setRefLoading(false);
    }
  }

  const fetchMe = useCallback(async () => {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    setMe(r.ok ? (await r.json()).wallet : null);
  }, []);

  const buildQuery = useCallback(
    (opts?: { forExport?: boolean }) => {
      const u = new URL(location.origin + "/api/admin/users");
      u.searchParams.set("page", String(page));
      u.searchParams.set("limit", String(opts?.forExport ? 5000 : pageSize));
      if (q.trim()) u.searchParams.set("q", q.trim());
      if (role !== "all") u.searchParams.set("role", role);
      if (banned !== "all") u.searchParams.set("banned", banned);
      if (country.trim()) u.searchParams.set("country", country.trim().toUpperCase());
      u.searchParams.set("sortBy", sortBy);
      u.searchParams.set("sortDir", sortDir);
      return u.toString();
    },
    [page, pageSize, q, role, banned, country, sortBy, sortDir]
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(buildQuery(), { cache: "no-store" });
      if (!r.ok) throw new Error("fetch failed");
      const j = await r.json();
      setRows(j.users || []);
      setTotal(j.total || 0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (me) loadPage();
  }, [me, loadPage]);

  // Resetear a página 1 al cambiar filtros
  useEffect(() => {
    setPage(1);
  }, [q, role, banned, country, pageSize, sortBy, sortDir]);

  useEffect(() => {
    if (me) loadPage();
  }, [page, pageSize, sortBy, sortDir, q, role, banned, country, me, loadPage]);

  const signIn = async () => {
    setSigning(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth?.request) return alert("MetaMask no está disponible");

      const provider = new BrowserProvider(eth);
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) return alert("No wallet selected");
      const signer = await provider.getSigner();
      const wallet = normalizeEvmWallet(accounts[0]);

      const n = await (await fetch("/api/admin/login")).json();
      const message = `Jharvi Admin Login\n\nNonce: ${n.nonce}`;
      const signature = await signer.signMessage(message);

      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, wallet }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return alert(e.error || "Admin login failed");
      }
      await fetchMe();
    } finally {
      setSigning(false);
    }
  };

  const act = async (
    wallet: string,
    action: "ban" | "unban" | "reset_daily" | "set_points",
    value?: number
  ) => {
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: checksum(wallet), action, value }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || "Action failed");
    } else {
      await loadPage();
    }
  };

  // Stats de la página actual
  const pageStats = useMemo(() => {
    const totalPoints = rows.reduce((a, r) => a + Number(r.total_points ?? 0), 0);
    const dailyPoints = rows.reduce((a, r) => a + Number(r.daily_points ?? 0), 0);
    const admins = rows.filter((r) => r.role === "admin").length;
    const bannedCount = rows.filter((r) => r.is_banned).length;
    return { totalPoints, dailyPoints, admins, bannedCount };
  }, [rows]);

  if (!me) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white grid place-items-center p-6">
        <div className="max-w-md w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Admin Panel</h1>
          <p className="text-white/70 mb-6">Conéctate y firma para entrar como administrador.</p>
          <button
            onClick={signIn}
            disabled={signing}
            className="px-4 py-2 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60"
          >
            {signing ? "Firmando..." : "Conectar y Firmar"}
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <div className="text-xs sm:text-sm text-white/70">
            Signed in as <span className="font-mono">{me}</span>
          </div>
        </header>

        {/* Stats (página) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Users (filtered)" value={total.toLocaleString()} />
          <StatCard label="Admins (page)" value={pageStats.admins.toLocaleString()} />
          <StatCard label="Banned (page)" value={pageStats.bannedCount.toLocaleString()} />
          <StatCard label="Total Points (page)" value={pageStats.totalPoints.toLocaleString()} />
          <StatCard label="Daily Points (page)" value={pageStats.dailyPoints.toLocaleString()} />
        </div>

        {/* Filtros */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
          <div className="flex-1">
            <label className="block text-xs text-white/60 mb-1">Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Wallet, total (=n), daily (=n)…"
              className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2"
            >
              <option value="all">All</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Banned</label>
            <select
              value={banned}
              onChange={(e) => setBanned(e.target.value as any)}
              className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2"
            >
              <option value="all">All</option>
              <option value="none">Only OK</option>
              <option value="only">Only Banned</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Country (ISO-2)</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. US, DO, AR"
              className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 w-32"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setQ(""); setRole("all"); setBanned("all"); setCountry("");
              }}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Reset
            </button>
            <button
              onClick={async () => {
                const url = buildQuery({ forExport: true });
                const r = await fetch(url, { cache: "no-store" });
                if (!r.ok) return alert("Export failed");
                const j = await r.json();
                const data: UserRow[] = j.users || [];
                downloadCSV(
                  `users_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
                  data.map((u) => ({
                    wallet: u.wallet,
                    role: u.role,
                    is_banned: u.is_banned,
                    country_code: u.country_code ?? "",
                    total_points: u.total_points ?? 0,
                    daily_points: u.daily_points ?? 0,
                    last_seen_at: u.last_seen_at ?? "",
                    referrals_total: u.referrals_total ?? 0,
                    referrals_completed: u.referrals_completed ?? 0,
                    referrals_pending: u.referrals_pending ?? 0,
                  }))
                );
              }}
              className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30"
            >
              Export (≤5000)
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 sticky top-0 z-10">
                <tr>
                  <Th label="Wallet" sortKey="wallet" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Role" sortKey="role" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Total" sortKey="total_points" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Daily" sortKey="daily_points" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Country" sortKey="country_code" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Last Seen" sortKey="last_seen_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <Th label="Status" sortKey="is_banned" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  {/* 👇 NUEVA COLUMNA */}
                  <Th label="Referrals" sortKey="referrals_total" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-white/70">Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-white/70">No results</td>
                  </tr>
                ) : (
                  rows.map((u) => (
                    <tr key={u.wallet} className="hover:bg-white/5">
                      <td className="px-4 py-2 font-mono break-all">{u.wallet}</td>
                      <td className="px-4 py-2">{u.role}</td>
                      <td className="px-4 py-2">{Number(u.total_points ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2">{Number(u.daily_points ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2">{u.country_code ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="text-white/90">{fmtDate(u.last_seen_at)}</span>
                          <span className="text-xs text-white/60">{timeAgo(u.last_seen_at)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${u.is_banned ? "bg-red-500/20" : "bg-emerald-500/20"}`}>
                          {u.is_banned ? "BANNED" : "OK"}
                        </span>
                      </td>

                      {/* 👇 CELDA DE REFERIDOS */}
                      <td className="px-4 py-2">
                        <span className="font-semibold">{u.referrals_completed ?? 0}</span>
                        <span className="opacity-70"> / {u.referrals_pending ?? 0}</span>
                        <span className="opacity-70"> ({u.referrals_total ?? 0})</span>
                        <button
                          onClick={() => openRefs(u.wallet)}
                          className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-xs"
                          title="View referred users"
                        >
                          View
                        </button>
                      </td>

                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        {u.is_banned ? (
                          <button onClick={() => act(u.wallet, "unban")} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">Unban</button>
                        ) : (
                          <button onClick={() => act(u.wallet, "ban")} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">Ban</button>
                        )}
                        <button onClick={() => act(u.wallet, "reset_daily")} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">Reset Daily</button>
                        <button
                          onClick={() => {
                            const v = prompt(`Set TOTAL points for\n${u.wallet}\nCurrent: ${u.total_points ?? 0}\n\nNew value:`);
                            if (v == null) return;
                            const n = Number(v);
                            if (!Number.isFinite(n)) return alert("Number required");
                            act(u.wallet, "set_points", n);
                          }}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                        >
                          Set Points
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 border-t border-white/10">
            <div className="text-sm text-white/70">
              Showing <span className="text-white">{first} - {last}</span> of{" "}
              <span className="text-white">{total}</span> users
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1"
              >
                {[10, 20, 50, 100, 200, 500].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-sm">
                  Page <span className="text-white">{page}</span> / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(total / pageSize)), p + 1))}
                  disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                  className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 👇 MODAL DETALLE DE REFERIDOS */}
      {refOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-3xl bg-neutral-950 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="text-sm text-white/70">Referrals of</div>
              <div className="font-mono text-xs">{refOwner}</div>
              <button onClick={() => setRefOpen(false)} className="px-2 py-1 bg-white/10 rounded">Close</button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              {refLoading ? (
                <div className="text-white/70">Loading…</div>
              ) : refItems.length === 0 ? (
                <div className="text-white/70">No referrals</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900/60">
                    <tr>
                      <th className="text-left px-3 py-2">Wallet</th>
                      <th className="text-left px-3 py-2">Hours</th>
                      <th className="text-left px-3 py-2">Total Points</th>
                      <th className="text-left px-3 py-2">Last Seen</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {refItems.map((r) => (
                      <tr key={r.wallet}>
                        <td className="px-3 py-2 font-mono break-all">{r.wallet}</td>
                        <td className="px-3 py-2">{r.hours.toLocaleString()}h</td>
                        <td className="px-3 py-2">{r.total_points.toLocaleString()}</td>
                        <td className="px-3 py-2">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${r.completed ? "bg-emerald-500/20" : "bg-white/10"}`}>
                            {r.completed ? "Completed (≥100h)" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function toggleSort(k: SortKey) {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir("desc");
    }
  }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Th({
  label,
  sortKey,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortBy === sortKey;
  return (
    <th
      className="px-4 py-3 text-left select-none cursor-pointer"
      onClick={() => onSort(sortKey)}
      title="Sort"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-xs ${active ? "opacity-100" : "opacity-40"}`}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}
