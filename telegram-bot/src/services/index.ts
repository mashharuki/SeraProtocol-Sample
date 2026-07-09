import type { AppConfig, Network } from "../config";
import type { Db } from "../db/client";
import {
  ApiKeyRepository,
  OrderRepository,
  PendingActionRepository,
  UserRepository,
  type UserRow,
} from "../db/repositories";
import { createPrivyClient } from "../privy/client";
import { PrivySigner } from "../privy/signer";
import { SeraClient } from "../sera/client";
import { AccountService } from "./account-service";
import { DepositService } from "./deposit-service";
import { FaucetService } from "./faucet-service";
import { OrderService } from "./order-service";
import { PendingActionService } from "./pending-actions";
import { RateService } from "./rate-service";
import { SwapService } from "./swap-service";
import { UserService } from "./user-service";

export interface Services {
  config: AppConfig;
  users: UserService;
  accounts: AccountService;
  rates: RateService;
  swaps: SwapService;
  orders: OrderService;
  deposits: DepositService;
  faucet: FaucetService;
  pendingActions: PendingActionService;
  /** Public (unauthenticated) Sera client for a network. */
  publicSera: (network: Network) => SeraClient;
  /** Sera client authenticated with the user's own API key (minted lazily). */
  authedSera: (user: UserRow) => Promise<SeraClient>;
}

export function buildServices(config: AppConfig, db: Db): Services {
  const privy = createPrivyClient(config.privyAppId, config.privyAppSecret);
  const signer = new PrivySigner(privy);

  const userRepo = new UserRepository(db);
  const apiKeyRepo = new ApiKeyRepository(db);
  const orderRepo = new OrderRepository(db);
  const pendingRepo = new PendingActionRepository(db);

  const publicClients = new Map<Network, SeraClient>();
  const publicSera = (network: Network): SeraClient => {
    let client = publicClients.get(network);
    if (!client) {
      client = new SeraClient({
        baseUrl: config.networks[network].seraBaseUrl,
      });
      publicClients.set(network, client);
    }
    return client;
  };

  const users = new UserService(
    userRepo,
    apiKeyRepo,
    signer,
    publicSera,
    config.defaultNetwork,
  );

  const authedSera = async (user: UserRow): Promise<SeraClient> => {
    const { key, secret } = await users.ensureApiKey(user);
    return publicSera(user.network).withApiKey(key, secret);
  };

  const pendingActions = new PendingActionService(pendingRepo);
  const rates = new RateService(publicSera);
  const accounts = new AccountService(config, authedSera);
  const swaps = new SwapService(rates, pendingActions, signer, publicSera);
  const orders = new OrderService(
    rates,
    pendingActions,
    orderRepo,
    signer,
    publicSera,
    authedSera,
  );
  const deposits = new DepositService(
    config,
    rates,
    accounts,
    pendingActions,
    signer,
    authedSera,
  );
  const faucet = new FaucetService(config, accounts, pendingActions, signer);

  return {
    config,
    users,
    accounts,
    rates,
    swaps,
    orders,
    deposits,
    faucet,
    pendingActions,
    publicSera,
    authedSera,
  };
}

/**
 * Process-wide registry so Mastra tools (constructed at module scope) can
 * reach the same service instances the bot uses.
 */
let registry: Services | null = null;

export function registerServices(services: Services): void {
  registry = services;
}

export function getServices(): Services {
  if (!registry) throw new Error("Services not initialized yet");
  return registry;
}
