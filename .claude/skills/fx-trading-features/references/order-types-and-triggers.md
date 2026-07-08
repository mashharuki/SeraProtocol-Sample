# Conditional Order Types & Trigger Design

Sera's contracts natively support **market** and **limit** orders on both v1 and v2 (see
`sera-protocol` skill's `references/smart-contracts.md` / `references/orderbook-v2.md`). Stop-loss,
take-profit, OCO, and trailing-stop are all **conditional orders** — "submit this order once price
crosses X" — and Sera has no on-chain primitive for that. This file covers how to design the
trigger layer that sits above Sera to provide them. Read `fx-glossary.md` §7 for exact definitions
of each order type before implementing.

## Table of contents
1. [The core problem: who watches, who submits](#core-problem)
2. [Why v2's signed-order model is the better foundation](#why-v2)
3. [Trigger engine design](#trigger-engine)
4. [OCO composition](#oco)
5. [Trailing stop](#trailing-stop)
6. [Failure modes to design around](#failure-modes)

---

## 1. The core problem: who watches, who submits {#core-problem}

A conditional order has two jobs that must both happen without the user needing to be online:
1. **Watch** the market price continuously and detect when it crosses the user's trigger level.
2. **Submit** the resulting order to Sera at that moment, with the user's authorization already
   in place (the user isn't there to sign in real time).

Neither job is something Sera's contracts do for you — both need to be built.

**Before designing job 2 (who submits), check whether the target contract actually permits
someone other than the order owner to act on their behalf.** Don't reason about "a keeper
submits the order" purely in the abstract — read the actual deployed ABI/source. v1's Router
(`limitBid`/`limitAsk`) takes a `user` parameter, and if the contract enforces
`msg.sender == params.user` (verify this directly in the Router source, not by assumption), then
no amount of off-chain keeper cleverness can submit on a user's behalf without an additional
on-chain delegation primitive — a session key, an ERC-4337 smart account, or a trusted-forwarder
meta-transaction path — none of which exist in the sample repo today. This is exactly the kind of
constraint that changes a design from "add a keeper service" to "add a keeper service AND a
delegation/session-key layer," so confirm it before committing to an architecture or estimate.

## 2. Why v2's signed-order model is the better foundation {#why-v2}

Sera v2 already separates "user authorizes" from "someone else submits": the user signs an
EIP-712 `Order` struct off-chain, and an `EXECUTOR_ROLE` holder submits it on-chain via
`Sera.matchOrders()` (or through `SeraBatcher`/`SeraSOR`) whenever it's ready to match. A
conditional order is naturally the same shape with one more gate before submission:

```
Normal v2 order flow:     user signs Order  →  executor submits when a counterparty matches
Conditional order flow:   user signs Order  →  held in a "pending trigger" queue
                                              →  executor submits once price crosses trigger level
                                                 (in addition to a counterparty being available)
```

This means you don't need a new trust model or a new custody mechanism — you need a service that
holds pre-signed orders, watches price, and calls the same submission path v2 already uses once
the trigger fires. This is significantly less new surface area than building conditional-order
support on v1, where there's no pre-authorization mechanism and a keeper would need its own
delegated allowance/permission structure to act on the user's behalf.

If the project is pinned to v1, the keeper needs a contract-level delegation primitive (e.g. a
"TriggerManager" that holds a limited, revocable allowance and calls `limitBid`/`limitAsk` on the
user's behalf when triggered) — design that delegation to be as narrow as possible (single order,
single price level, expires) rather than a broad standing permission.

## 3. Trigger engine design {#trigger-engine}

Regardless of v1/v2, the trigger-watching service needs:

- **A price feed** — same choice as the liquidation engine in `margin-leverage-design.md`
  (Sera's GraphQL `latestPrice` for convenience/UI, direct on-chain book state or an external
  oracle for anything where a missed trigger has real consequences).
- **A trigger registry**: `{ orderId, owner, pair, triggerPrice, direction (above/below), action
  (submit this pre-signed order / cancel this resting order) }`, indexed for efficient "which
  triggers does this new price cross" lookups (don't linearly scan all triggers on every price
  tick once volume grows — index by price range).
- **Idempotent submission**: the same trigger must not fire twice for the same order (a price
  oscillating around the trigger level should not cause duplicate submissions) — track a
  `triggered` state transition and make it a precondition the submission checks on-chain, not
  just in the off-chain service (the off-chain service can crash/restart; the on-chain check is
  what actually prevents a double-fill).
- **Explicit trigger semantics for stop vs. take-profit**: a stop-loss on a long position triggers
  when price falls *to or below* the trigger level; a take-profit on the same long position
  triggers when price rises *to or above* its level. Get the inequality direction right for both
  long and short positions — this is the single easiest place to introduce a sign error (four
  combinations: long stop, long take-profit, short stop, short take-profit — write a test for
  each, see `testing-strategies.md`).

## 4. OCO composition {#oco}

An OCO order is not a new primitive — it's a stop-loss and a take-profit registered as a *linked
pair*, where triggering either one must cancel the other:

```
registerOCO(stopLossOrder, takeProfitOrder):
  register both in the trigger registry with a shared `ocoGroupId`
  on trigger of either:
    submit the triggered order
    cancel/invalidate the sibling (remove from registry; if v1's delegated order was already
      resting on Sera's book, actually cancel it via the Order Canceller contract)
```

The failure mode to design against: both legs triggering in the same price tick (a fast gap move
through both levels). Decide and document which one wins (typically "whichever the engine
processes first" is acceptable, but make it deterministic and make sure the cancellation of the
loser is still correctly applied even though it also technically crossed its trigger).

## 5. Trailing stop {#trailing-stop}

A trailing stop's trigger level moves with favorable price movement but never against it:

```
for a long position with trailDistance:
  triggerLevel = max(triggerLevel, currentPrice - trailDistance)   # ratchets up only
for a short position:
  triggerLevel = min(triggerLevel, currentPrice + trailDistance)   # ratchets down only
```

Recompute on every price update the trigger engine observes (not just periodically) — a trailing
stop that only updates every N seconds gives up protection during fast moves. State clearly which
price the trail is computed from (mid, last trade, or the same price source used for other
triggers) since inconsistency here causes the trail to lag or overreact relative to what the user
sees on their chart.

## 6. Failure modes to design around {#failure-modes}

- **Keeper downtime**: if the off-chain trigger-watching service is down, conditional orders
  silently don't fire. Either run redundant keepers, or make the trigger check something anyone
  can permissionlessly call on-chain (with a small execution-fee incentive) so the system doesn't
  depend on a single operator's uptime — the latter is the more robust, decentralization-aligned
  design and worth defaulting to if the user hasn't specified otherwise.
- **Gap moves through the trigger price**: price can jump past a trigger level between observed
  ticks (illiquid moments, news events). Decide explicitly whether the order then executes at the
  trigger price (unrealistic — that liquidity may not exist) or at the next available price
  (realistic, but means realized loss/profit can differ from the trigger level the user set) —
  and say which one the design implements, since users will be surprised if their expectation
  doesn't match.
- **Sera-side liquidity for the resulting order**: a triggered stop-loss is still just a market or
  limit order once submitted — if Sera's book is thin at that price, it can partially fill or fill
  at worse prices (slippage). This is a real constraint of building on Sera's spot book rather than
  a centralized broker's guaranteed-fill model; surface it rather than assuming trigger price ==
  fill price.
