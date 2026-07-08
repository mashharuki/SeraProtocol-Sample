# Designing Margin & Leverage on Top of Sera

Sera's deployed contracts (v1 Router/OrderBook/PriceBook, v2 Sera/Vault/SeraSOR) are **fully
collateralized spot trading only** — a limit or market order settles against real tokens, there is
no borrowing, no notional in excess of posted collateral, and no position that persists as an
open, mark-to-market exposure. Adding leverage means adding a whole new layer *above* Sera's spot
book, not a parameter on an existing order. Read `fx-glossary.md` first for the margin/leverage
formulas this design uses.

## Table of contents
1. [Two architectural patterns](#patterns)
2. [Pattern A: synthetic (perpetual-style) positions](#synthetic)
3. [Pattern B: lending-integrated real-margin positions](#lending)
4. [Choosing between them](#choosing)
5. [Liquidation engine design](#liquidation)
6. [Which Sera layer to build on](#which-layer)

---

## 1. Two architectural patterns {#patterns}

Real-world leveraged trading always resolves to one of two designs, and they have very different
trust, capital, and complexity profiles:

- **Pattern A — Synthetic / perpetual-style**: no actual borrowing happens. A separate contract
  (a "Position Manager" or "Perp Vault") tracks each user's notional exposure and posted margin as
  pure accounting entries, references Sera's spot price as an oracle/index, and settles PnL in
  collateral tokens when positions close or liquidate. This is how on-chain perpetual DEXs
  (dYdX-style, GMX-style) work, and it's the pattern to reach for by default — it doesn't require
  a lending market, doesn't move more capital than actually exists, and keeps Sera's spot book
  completely decoupled (used only as a price reference, never touched by the leverage logic
  itself).
- **Pattern B — Lending-integrated real margin**: the extra notional is *actually borrowed*
  (from a lending pool or a treasury) and *actually swapped* through Sera's spot book to acquire
  the real underlying exposure. This is closer to how a bank or prime broker offers real FX margin
  trading — real capital moves, real interest accrues on the borrowed leg (this is literally where
  a genuine swap point comes from, rather than a designed-in funding rate), and closing a position
  means actually swapping back through Sera and repaying the loan.

## 2. Pattern A: synthetic positions {#synthetic}

Core data model (per open position):

```
Position {
  owner: address
  pair: (baseToken, quoteToken)          // or a Sera market id
  direction: Long | Short
  notionalSize: uint256                  // in quote units
  entryPrice: uint256                    // captured at open, from Sera's price oracle
  marginPosted: uint256                  // collateral actually deposited
  leverage: notionalSize / marginPosted  // derived, not stored redundantly
  accruedSwap: int256                    // running total, can be negative
  openedAt: timestamp
}
```

- **Opening a position**: user deposits `marginPosted` collateral; contract computes
  `notionalSize = marginPosted * requestedLeverage`; records `entryPrice` from the chosen oracle
  (see below). No trade happens on Sera's book at all — the exposure is purely synthetic.
- **Marking to market**: `unrealizedPnL = (currentPrice - entryPrice) * notionalSize / entryPrice`
  (long) or the negated form (short), using the PnL formula from `fx-glossary.md`.
- **Price oracle choice matters a lot here**: Sera's GraphQL subgraph `latestPrice` is convenient
  but can lag block time and is queryable, not push-based — fine for UI display, risky as the
  sole liquidation trigger source (a keeper polling GraphQL could miss a fast move). For anything
  beyond a prototype, either poll Sera's on-chain book directly (best bid/ask from `PriceBook`/
  `Vault` state) at liquidation-check time, or integrate an external price oracle (Chainlink or
  similar) as the authoritative index and treat Sera's own book as a secondary sanity check.
- **Funding/swap accrual**: since no real borrowing happens, the "swap point" here is a *designed*
  periodic funding payment between longs and shorts (or against a protocol insurance fund),
  computed from a rate you choose — typically referencing the real-world interest-rate
  differential of the underlying currency pair (see `fx-glossary.md` §4) so the product's
  economics resemble genuine FX carry rather than an arbitrary fee. State this design choice
  explicitly to the user: it's synthetic, so the swap rate is a parameter you're setting, not a
  market-derived number, unless you wire it to an external rates feed.
- **Closing/settlement**: compute `realizedPnL` per the glossary's formula, transfer
  `marginPosted + realizedPnL + accruedSwap` back to the user from the Position Manager's
  collateral pool. The collateral pool must always hold enough to cover this — see
  [liquidation engine design](#liquidation) for the solvency invariant this depends on.

## 3. Pattern B: lending-integrated real margin {#lending}

- **Opening a position**: user deposits `marginPosted`; contract borrows
  `notionalSize - marginPosted` from a lending pool (this could be a bespoke pool or an existing
  protocol integration); the full `notionalSize` is then actually swapped through Sera's spot book
  (v1 `limitBid`/`limitAsk`/market order, or v2 `Sera.matchOrders()`/`SeraSOR`) to acquire real
  base-currency exposure, which is held by the position contract (or Sera's v2 `Vault` if built on
  v2) as collateral for the loan.
- **Swap point here is real**: it's the actual interest accruing on the borrowed leg, netted
  against any yield the held collateral earns — this is a much closer match to how a real FX
  broker computes swap than Pattern A's designed-in rate.
- **Closing**: swap the held base currency back through Sera's spot book, repay the loan +
  accrued interest, return the remainder to the user.
- **This pattern is significantly more complex** (needs a lending market, needs the position to
  actually move real spot liquidity through Sera on every open/close, exposed to Sera's own
  slippage/liquidity depth on entry and exit) and should only be chosen when the user specifically
  wants real capital movement and real market-rate swap economics rather than a synthetic product.

## 4. Choosing between them {#choosing}

Default to **Pattern A** unless the user says otherwise, because:
- It doesn't require building or integrating a lending market as a prerequisite.
- It doesn't consume Sera's actual spot liquidity for every leveraged position (Pattern B does,
  and a large leveraged position could move the spot price it's referencing — a reflexivity risk
  Pattern A avoids entirely).
- Nearly every successful on-chain leveraged-trading product (perpetuals) uses this pattern.

Choose **Pattern B** when the user explicitly wants the leveraged position to represent real
underlying spot ownership (e.g. for a product marketed as genuine margin FX rather than a
derivative), or when regulatory/product requirements demand the position be backed by real assets
rather than a synthetic claim.

## 5. Liquidation engine design {#liquidation}

Applies to both patterns. Core invariant: **the protocol must never let a position's losses
exceed its posted margin** (this is what a loss-cut protects against, per `fx-glossary.md` §3).

- Compute margin level continuously (on every price update that could move it, not just on a
  timer) per the glossary's formula: `equity / usedMargin * 100`.
- Two independently configurable thresholds, checked in this order:
  1. **Margin call threshold** (e.g. 100%): emit a warning event/notification only. No state
     change.
  2. **Loss-cut / liquidation threshold** (e.g. 50%): forcibly close the position(s) needed to
     bring the account back above a safe margin level (often "close enough positions to return to
     the margin-call threshold," not necessarily everything).
- **Liquidation execution** for Pattern A: settle at current oracle price directly against the
  Position Manager's collateral pool — no Sera trade needed since the position was never real
  spot exposure.
- **Liquidation execution** for Pattern B: must actually sell the held collateral through Sera's
  spot book to repay the loan — this means liquidation is subject to Sera's live order-book depth
  and can suffer slippage; size any safety margin (the gap between margin-call and loss-cut
  thresholds) to absorb this, not just price-oracle staleness.
- **Race conditions to test for explicitly** (see `testing-strategies.md`): a user closing a
  position in the same block/moment a keeper is trying to liquidate it; two keepers racing to
  liquidate the same position; a price oracle update landing between the margin check and the
  liquidation transaction executing.

## 6. Which Sera layer to build on {#which-layer}

- **v1 (Router/OrderBook/PriceBook)**: NFT-based limit orders, no signed-order infrastructure. If
  you need Pattern B (real swaps through Sera on open/close), you'll be calling `limitBid`/
  `limitAsk`/market order functions directly and managing the NFT order lifecycle yourself.
- **v2 (Sera/Vault/SeraSOR)**: Vault custody + EIP-712 signed orders + `SeraSOR` for multi-leg
  routing is a *much* better foundation for either pattern — the Vault already gives you a
  collateral-custody primitive to build a Position Manager against, and `SeraSOR.executeIntent()`
  is a natural fit for Pattern B's "swap the full leveraged notional in one signed intent."
  Prefer v2 unless the user's existing integration is specifically pinned to v1.
