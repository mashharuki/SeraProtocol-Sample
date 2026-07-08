# Testing & Verification Strategies for FX Features

FX position/risk logic is a bad place for example-only unit tests to be the *only* safety net —
the dangerous bugs live at boundary conditions (an exact threshold crossing, two triggers firing
in the same instant, a sign flip on short positions) that a handful of hand-picked examples tend
not to hit. This file lays out a layered test strategy: unit → property-based → simulation →
end-to-end, matched to what each layer of `margin-leverage-design.md` and
`order-types-and-triggers.md` actually needs verified.

## Table of contents
1. [Unit tests: FX math primitives](#unit)
2. [Property-based tests: margin & liquidation invariants](#property)
3. [Simulation/backtesting: replay real price sequences](#simulation)
4. [Race-condition & concurrency tests](#race)
5. [End-to-end tests: full user flows](#e2e)
6. [Chart/OHLC correctness tests](#chart-tests)
7. [Suggested tooling by layer](#tooling)

---

## 1. Unit tests: FX math primitives {#unit}

Write direct example tests for every formula in `fx-glossary.md` — these are cheap, fast, and
catch the most common class of bug (wrong formula, transposed operands):

- Pip value calculation for both a standard pair and a JPY-quote pair (different pip size).
- Required margin / leverage / margin level, including at `usedMargin = 0` (must not divide by
  zero — decide and test the defined behavior, e.g. margin level is undefined/∞ with no open
  positions).
- PnL for long and short, at a gain and at a loss (four cases minimum) — verify the sign is
  correct for all four independently; a short-position PnL sign bug is a classic and easy mistake.
- Swap point sign for all four combinations of (long/short) × (higher-yield/lower-yield currency
  held) — per `fx-glossary.md` §4.
- Spread computed from a given best-bid/best-ask pair.

## 2. Property-based tests: margin & liquidation invariants {#property}

Example tests alone won't catch a bug that only appears at, say, `marginLevel == 
lossCutThreshold` exactly, or with an unusual combination of leverage + price move. Use
property-based testing (e.g. `fast-check` for TypeScript, Foundry's built-in fuzzing for Solidity)
to state invariants and let the framework search for violating inputs:

- **Solvency invariant**: for any sequence of opens/price-moves/closes, the Position
  Manager's collateral pool balance must never go negative, and a user's `realizedPnL +
  marginPosted` payout must never exceed what they're actually entitled to withdraw.
- **Loss-cut invariant**: for any price path, once margin level crosses below the loss-cut
  threshold, the position must be liquidated before margin level could reach 0% (i.e. the
  liquidation threshold's buffer must be sufficient given the maximum single price move you assume
  possible between checks — this is exactly the invariant a real broker's risk team would size the
  loss-cut threshold against).
- **Margin-call-before-loss-cut ordering invariant**: margin-call threshold must always be checked
  (and fire) before loss-cut, for any margin level trajectory that crosses both.
- **Monotonic trailing-stop invariant**: a trailing stop's trigger level must never move against
  the position's favor (per `order-types-and-triggers.md` §5), for any price path fed to it —
  this is a natural fuzz target since "never decreases for a long position" is a simple, checkable
  property across arbitrary price sequences.

## 3. Simulation/backtesting: replay real price sequences {#simulation}

Property-based tests explore synthetic price paths; simulation tests replay **real historical
price/candle data** (from Sera's subgraph trade history, or an external FX rate history) through
the margin/liquidation/trigger logic to catch issues synthetic fuzzing won't surface, such as:

- **False liquidation from intra-bar wicks**: if your liquidation check only samples closing
  prices but a real intra-candle wick would have crossed the loss-cut threshold, decide explicitly
  whether the design uses wick (high/low) or close-only price checks — and backtest against real
  volatile periods (news events, low-liquidity hours) to confirm the choice behaves as intended
  rather than triggering liquidations a real system wouldn't, or missing ones it should catch.
- **Swap accrual over real rollover periods**: replay a multi-day holding period through the swap
  accrual logic and manually verify the accumulated total against an independently computed
  expectation (e.g. a spreadsheet) — this is the kind of bug (off-by-one day, wrong rollover
  timezone) that only shows up over a realistic multi-day span, not a single unit test.
- **Trigger engine against real gap moves**: replay a period containing an actual price gap
  (weekend open, news spike) through the trigger engine and confirm it resolves the "fill at
  trigger price vs. next available price" question the way `order-types-and-triggers.md` §6
  documents it should.

## 4. Race-condition & concurrency tests {#race}

These need to be deliberately constructed, not just hoped for from example tests — the underlying
bugs are timing-dependent:

- User submits a manual close for a position in the same block a keeper submits a liquidation for
  it — assert exactly one of the two succeeds and the position ends in a consistent state (no
  double-payout, no stuck position).
- Two OCO legs both cross their trigger levels in the same price tick — assert exactly one order
  executes and the other is correctly cancelled (per `order-types-and-triggers.md` §4), for both
  possible "which one the engine processes first" orderings.
- Two independent keepers race to submit the same liquidation or trigger — assert idempotent
  submission (the on-chain precondition check, not just the off-chain service's bookkeeping,
  rejects the second attempt).

## 5. End-to-end tests: full user flows {#e2e}

Drive the actual UI/API, not just the underlying logic in isolation, for the flows a real trader
depends on:

- Open a leveraged position → mock/advance the price feed toward the loss-cut threshold → verify
  a margin-call warning appears in the UI before liquidation, and that the position is actually
  force-closed once the loss-cut threshold is crossed.
- Place an OCO order → move price through one leg → verify the UI reflects the fill and shows the
  sibling order as cancelled, not still pending.
- Load a candlestick chart with a synthetic trade history → verify the rendered candles match the
  expected OHLC values computed independently (don't just check "a chart rendered," assert on
  specific open/high/low/close numbers for at least one known bucket).

## 6. Chart/OHLC correctness tests {#chart-tests}

Separate from the general e2e chart check above, unit-test the bucketing logic in
`charting-technical-analysis.md` §1 directly against constructed trade lists:

- A bucket with multiple trades: assert `open` is the first trade's price and `close` is the last,
  not e.g. the min/max or an average.
- An empty bucket: assert the design's chosen behavior (omitted vs. flat carry-forward candle) is
  what's actually produced, not silently whichever the aggregation happened to fall into.
- Boundary alignment: trades placed exactly at a bucket boundary land in the correct (not the
  adjacent) bucket.
- Multi-timeframe re-aggregation (building 1h from 1m): assert the composed candle's OHLC matches
  what direct bucketing from raw trades at the 1h granularity would have produced.

## 7. Suggested tooling by layer {#tooling}

| Layer | Language/context | Tool |
|---|---|---|
| Unit + property-based (TypeScript backend/frontend logic) | TS | Vitest + `fast-check` |
| Unit + property-based (Solidity contracts) | Solidity | Foundry (`forge test`, built-in fuzzing, invariant testing via `forge invariant`) |
| Simulation/backtesting | TS or a script | A standalone harness that feeds historical/synthetic price series through the same code paths production uses — not a reimplementation of the logic in the test |
| Race/concurrency | Foundry (same-block scenarios) or a local devnet | See `midnight-tooling`-style devnet patterns generally; for Sera specifically, a local Anvil/Hardhat fork with scripted concurrent transactions |
| End-to-end | Frontend | Playwright, driving the real UI against a local/testnet deployment |

Match the test to the bug class it's meant to catch — don't rely on e2e tests to catch a margin
math sign error (slow feedback, hard to pinpoint) when a two-line unit test would catch it
instantly, and don't rely on unit tests alone to catch a race condition (they can't, by
construction — the bug only exists under concurrent execution).
