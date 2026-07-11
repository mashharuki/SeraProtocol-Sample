# AGENTS.md

## CRITICAL: Load `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge — APIs change between versions.

## Rules

- Register all agents, tools, workflows, and scorers in `src/mastra/index.ts`
- Use the `dev` and `build` scripts from `package.json` instead of running `mastra dev` / `mastra build` directly

## Project invariants (Sera FX bot — do not break)

1. **Sign verbatim.** EIP-712 payloads from Sera (`route_params` from `/swap/quote`,
   the `/orders/preview` response) are signed exactly as returned. Never reconstruct
   or "fix" them client-side. **Sole documented exception:** VL batch legs — the
   preview only accepts standalone uuid_int encodings, so `liquidity-service.ts`
   swaps ONLY the `uuid` field to the VL encoding before signing (verified live
   2026-07-10); everything else stays verbatim.
2. **Address casing.** Read endpoints (`/balances` etc.) take `owner_address` in
   **lowercase**; signed payloads use the checksummed address as-is.
3. **Money moves through one path only.** Every fund-moving flow creates a
   `pending_actions` row (single-use, TTL) → confirmation card → user's button tap →
   `bot/callbacks.ts` → `PrivySigner`. Mastra tools are read-only or prepare-only;
   they must never sign or submit.
4. **Identity from requestContext.** Mastra tools resolve the user from
   `requestContext` values set by the bot layer — never from model-provided arguments.
5. **No hardcoded chain data.** Chain id, contract addresses, and the EIP-712 domain
   come from `GET /config` per network.
6. **Sera is spot-only.** No leverage, margin, or stop-loss anywhere in code or copy.
7. **Precision.** Validate against `tick_precision`/`quantity_precision` before any
   API call; `rounding_mode` is `reject_extra_precision` — never silently round.
8. **Order retries reuse the same `order_id`** (server dedupes); `uuid_int` must be
   `encodeUuidInt(order_id)` (`src/sera/uuid-int.ts`) or the API rejects it.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- `.claude/skills/sera-protocol/references/api-reference.md` — Sera REST v2 一次資料
