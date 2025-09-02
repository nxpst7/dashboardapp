"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { normalizeEvmWallet } from "@/lib/wallet/normalize";

type AuthContextType = {
  account: string | null;
  connectWallet: () => Promise<string | null>;
  disconnectWallet: (fingerprint?: string) => void;
};

const AuthContext = createContext<AuthContextType>({
  account: null,
  connectWallet: async () => null,
  disconnectWallet: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);

  // Restaura cuenta de sesión si la guardas en localStorage (opcional)
  useEffect(() => {
    const saved = localStorage.getItem("evm_account");
    if (saved) setAccount(saved);
  }, []);

  // Escucha cambios de cuentas en MetaMask
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) return;

    const handler = (accounts: string[]) => {
      if (accounts?.length > 0) {
        const checksum = normalizeEvmWallet(accounts[0]);
        setAccount(checksum);
        localStorage.setItem("evm_account", checksum);
      } else {
        setAccount(null);
        localStorage.removeItem("evm_account");
      }
    };

    eth.on?.("accountsChanged", handler);
    return () => {
      eth?.removeListener?.("accountsChanged", handler);
    };
  }, []);

  const connectWallet = async (): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    const eth = (window as any).ethereum;
    if (!eth?.request) {
      alert("MetaMask no está disponible");
      return null;
    }
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) return null;

    // ✅ Normaliza SIEMPRE a checksum
    const checksum = normalizeEvmWallet(accounts[0]);
    setAccount(checksum);
    localStorage.setItem("evm_account", checksum);
    return checksum;
  };

  const disconnectWallet = (_fingerprint?: string) => {
    setAccount(null);
    localStorage.removeItem("evm_account");
  };

  return (
    <AuthContext.Provider value={{ account, connectWallet, disconnectWallet }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
