---
name: fx-trading-features
description: "Design, implement, and test retail-FX-style trading features (leverage/margin positions, stop-loss/take-profit/OCO conditional orders, candlestick charting with technical indicators, swap points/carry) on top of Sera Protocol's spot CLOB DEX. Sera's deployed contracts (v1 Router/OrderBook/PriceBook and v2 Sera/Vault/SOR) are spot-only — no margin, no leverage, no conditional orders, no native charting — so use this skill whenever the user wants to add any of that. Trigger on: leverage, margin trading, margin call, loss-cut/ロスカット, 証拠金, レバレッジ, スワップポイント/swap point, pip/pips, spread cost, stop-loss, take-profit, OCO order, trailing stop, 逆指値/指値/成行注文, candlestick/ローソク足 chart, trend line/トレンドライン, moving average, PnL calculation for FX positions, liquidation engine, funding rate for synthetic FX, or building any 'FXアプリ'/'FXプロダクト'/forex trading product feature. Also use when reviewing whether FX terminology, margin math, or order-trigger logic in code is correct, or when designing test/backtesting strategies for FX position or risk-management logic. Complements (does not replace) the sera-protocol skill — read that one first for how Sera's existing spot contracts/API/GraphQL work, then use this one for the FX-specific features layered on top."
---

# FX Trading Features for Sera Protocol

You are designing, implementing, or testing FX (foreign exchange) trading features — leverage/margin, conditional orders, charting, swap points — as an *extension* on top of Sera Protocol. This skill exists because **Sera's deployed contracts are spot-only**: v1 (Router/OrderBook/PriceBook) and v2 (Sera/Vault/SeraSOR) both settle immediate or resting limit trades at a fixed price, with no borrowing, no leverage, no conditional triggers, and no chart rendering. Everything in this skill is *new functionality you are designing*, not documentation of something already deployed — say so explicitly when advising the user, and never claim a Sera contract already has a capability it doesn't.

Read `sera-protocol` skill first (or its `references/smart-contracts.md` / `references/orderbook-v2.md`) if you haven't already, so you know what the base layer actually gives you: price-index arithmetic (`price = minPrice + tickSpace * priceIndex`), NFT limit orders (v1) or EIP-712 signed order matching + Vault custody (v2), and a GraphQL subgraph for market/trade history.

## Why this skill exists (grounding in real FX mechanics)

Retail FX products (studied from Japanese broker/beginner materials — SBI証券, じぶん銀行, 松井証券(kabu.com), min-fx.jp) share a consistent core: trade currency pairs on margin with leverage, earn/pay swap points from the interest-rate differential, manage risk via stop-loss/take-profit/OCO orders and a margin-call/loss-cut mechanism, and read price action via candlestick charts with trend lines and moving averages. None of that is exotic — it's well-established, and getting the terminology and math *exactly* right matters more than being creative, because small errors (wrong margin-call threshold, wrong swap sign, off-by-one pip conversion) directly cause wrong trading decisions or fund loss. Treat correctness here the way you'd treat correctness in payment code.

## Map of this skill

| Task | Read |
|---|---|
| Terminology, formulas (pip, spread, leverage, margin, swap point) — get these exactly right before writing any FX math | `references/fx-glossary.md` |
| Designing margin/leverage positions on top of Sera's spot book (synthetic vs. lending-integrated) | `references/margin-leverage-design.md` |
| Stop-loss/take-profit/OCO/trailing-stop — Sera has no on-chain trigger primitive, so these need a trigger design | `references/order-types-and-triggers.md` |
| Candlestick charts, moving averages, trend lines, deriving OHLC from Sera's trade history | `references/charting-technical-analysis.md` |
| Unit/property/simulation/e2e test strategy for margin math, liquidation, and triggers | `references/testing-strategies.md` |

Each reference file is self-contained; read only the one(s) relevant to the current task.

## Core concepts (just enough to orient — full detail in fx-glossary.md)

- **Currency pair**: quoted as `BASE/QUOTE` (e.g. USD/JPY); buying the pair means buying base, selling quote.
- **Pip**: the standard smallest quoted increment (0.0001 for most pairs, 0.01 for JPY-quoted pairs). Don't confuse with Sera's `priceIndex`/`tickSpace`, which are protocol-specific price grid units — a pip is a trading/display convention layered on top, not the same as a tick.
- **Leverage**: `positionNotional / marginPosted`. Retail FX in Japan is capped at 25× for individuals by FSA regulation — treat any leverage cap as a *configurable parameter*, not a hardcoded universal constant, since Sera is not a JP-licensed broker and the deployed product may target a different jurisdiction or no leverage cap regulation at all.
- **Margin level** and **margin call / loss-cut (ロスカット)**: margin level = `equity / usedMargin * 100`; a margin call warns the trader when this drops below a broker-set threshold (commonly ~100%), and a loss-cut *forcibly* closes the position at a lower threshold (commonly ~50%) to prevent equity going negative. These are two different thresholds — don't conflate them.
- **Swap point**: daily interest-rate-differential accrual for holding a position overnight; sign depends on direction (long the higher-yielding currency of the pair earns swap, long the lower-yielding one pays it). This is unrelated to Sera's per-order `feeBps` — swap accrues continuously while a position is open, fees are charged once at execution.
- **Order types**: market (immediate, at best available price — Sera v1/v2 both support this), limit (rests until price reached — Sera v1/v2 both support this), stop-loss/take-profit/OCO/trailing-stop (conditional, **not natively supported by Sera** — see `order-types-and-triggers.md`).

## Common tasks

### "I want to add leverage/margin trading on top of Sera"
1. Read `references/margin-leverage-design.md` in full before writing any contract or backend code — the synthetic-perpetual-style pattern vs. the lending-integrated pattern have very different trust and capital assumptions, and picking the wrong one for the user's actual goal wastes the most implementation effort in this whole skill.
2. Confirm with the user which Sera layer they're building on (v1 Router or v2 Vault) — the collateral custody model differs.
3. Pull the accurate formulas from `references/fx-glossary.md` — don't derive margin/leverage math from memory.
4. Design the liquidation engine's price source explicitly: Sera's GraphQL `latestPrice` (subgraph, can lag) vs. a dedicated oracle feed — this choice determines how conservative the maintenance-margin threshold needs to be.

### "I want to add stop-loss / take-profit / OCO orders"
1. Read `references/order-types-and-triggers.md` — the key insight is that Sera v2's EIP-712 signed-order model already separates "user authorizes" from "executor submits," which is exactly the shape a conditional-order trigger needs, so prefer building on v2 over v1 if the user has the choice.
2. Decide who watches the trigger price and who is trusted to submit the resulting order (a keeper service, the same `EXECUTOR_ROLE` used for normal matching, or something else) and write that trust boundary down before implementing.
3. If v1 is in play, actually check the Router's source/ABI for a `msg.sender == params.user` style restriction before proposing a keeper/delegation design — don't reason about delegated submission purely in the abstract, since this single check can change the whole feasibility picture (see `order-types-and-triggers.md` §1).

### "I want to build a candlestick chart / technical analysis view"
1. Read `references/charting-technical-analysis.md` for OHLC bucketing from Sera's trade history and the recommended charting library.
2. If styling/color/dashboard-layout guidance is also needed, combine with the general `dataviz` skill — this skill covers the FX-specific data shape (OHLC, trend lines, indicators), `dataviz` covers general chart design quality.

### "I want to check/test FX math or risk logic"
1. Read `references/testing-strategies.md` — margin/liquidation code needs property-based and simulation testing, not just example-based unit tests, because the dangerous bugs are at boundary conditions (exact threshold crossings, simultaneous triggers) that example tests tend to miss.

### "Review this code for FX terminology/logic correctness"
1. Cross-check every term and formula against `references/fx-glossary.md` before commenting — FX terminology has precise, broadly-agreed meanings (this isn't a place for a plausible-sounding paraphrase), and a subtly wrong formula (e.g. margin level computed against balance instead of equity) is the kind of bug that only shows up under a market move, not in a demo.

## Guardrails

- **Never claim Sera already supports leverage, margin, or conditional orders.** It doesn't, on either version. Every feature in this skill is something you're adding.
- **Don't hardcode jurisdiction-specific regulatory numbers (25× leverage cap, specific loss-cut %) as if they were protocol constants.** Surface them as configuration the user/product owner sets, and mention the regulatory context so they know it's a real-world constraint some jurisdictions impose, not an arbitrary default.
- **Keep swap point, spread, and fee separate in any PnL model.** They have different accrual timing (fee: per trade, swap: daily while held, spread: implicit in entry/exit price difference) and mixing them produces PnL numbers that don't reconcile.
- **Distinguish "priceIndex/tick" (Sera's protocol-level price grid) from "pip" (FX trading/display convention).** They solve different problems and are not interchangeable in code or in explanations to the user.
