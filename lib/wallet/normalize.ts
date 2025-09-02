// EVM (MetaMask): forma canónica = EIP-55 checksum
import { getAddress as evmChecksum } from "ethers";

export function normalizeEvmWallet(addr: string): string {
  // Lanza si el address es inválido
  return evmChecksum(addr);
}
