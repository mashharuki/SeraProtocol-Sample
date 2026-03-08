import { create } from "zustand";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { SEPOLIA_CHAIN_ID } from "../config/constants";

interface WalletState {
  address: string | null;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  isConnecting: boolean;
  error: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  chainId: null,
  signer: null,
  provider: null,
  isConnecting: false,
  error: null,

  connect: async () => {
    // @ts-expect-error ethereum is injected by wallet
    const ethereum = window.ethereum;
    if (!ethereum) {
      set({ error: "No wallet found. Install MetaMask or use WalletConnect." });
      return;
    }
    set({ isConnecting: true, error: null });
    try {
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      set({
        provider,
        signer,
        address,
        chainId: Number(network.chainId),
        isConnecting: false,
      });

      ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length === 0) {
          get().disconnect();
        } else {
          set({ address: accounts[0] });
        }
      });

      ethereum.on("chainChanged", (chainIdHex: string) => {
        set({ chainId: parseInt(chainIdHex, 16) });
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Connection failed",
        isConnecting: false,
      });
    }
  },

  disconnect: () => {
    set({
      address: null,
      chainId: null,
      signer: null,
      provider: null,
      error: null,
    });
  },

  switchToSepolia: async () => {
    // @ts-expect-error ethereum is injected by wallet
    const ethereum = window.ethereum;
    if (!ethereum) return;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
      });
    } catch (err) {
      // Chain not added — try adding it
      if ((err as { code: number }).code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
              chainName: "Sepolia Testnet",
              rpcUrls: ["https://0xrpc.io/sep"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      }
    }
  },
}));
