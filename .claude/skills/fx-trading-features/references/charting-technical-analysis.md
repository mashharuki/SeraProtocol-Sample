# Candlestick Charting & Technical Analysis UI

Sera's frontend sample (`frontend/`, React 19 + Vite + Tailwind, see `sera-protocol` skill's
`references/frontend-patterns.md`) has no charting library today, so the chart component itself is
new work — but **check `references/graphql-api.md` in the `sera-protocol` skill before assuming you
need to build OHLC aggregation yourself**: Sera's subgraph already exposes a pre-aggregated
`chartLogs` entity (`timestamp, open, high, low, close, volume, intervalType`, with
`intervalType` one of `"1m", "5m", "15m", "1h", "4h", "1d", "1w"`). For any of those standard
intervals, query `chartLogs` directly and skip building a bucketing pipeline entirely. This file
covers both that fast path and the manual-bucketing fallback for cases `chartLogs` doesn't cover.

## Table of contents
1. [Getting OHLC candles: chartLogs first, manual bucketing as fallback](#ohlc)
2. [Candlestick rendering basics](#candlestick)
3. [Charting library choice](#library)
4. [Trend lines & drawing tools](#trendlines)
5. [Common indicators](#indicators)
6. [Relationship to the `dataviz` skill](#dataviz-relationship)

---

## 1. Getting OHLC candles: chartLogs first, manual bucketing as fallback {#ohlc}

**Default to querying `chartLogs`** (see `sera-protocol` skill's `references/graphql-api.md` §Chart
Queries) for any of its seven standard intervals — it's already bucketed server-side, so there's no
aggregation code to write or get subtly wrong. Only fall back to manual bucketing from raw
trades/fills when the user needs something `chartLogs` doesn't provide: a non-standard interval
(e.g. 2h, 30s), the live/in-progress candle updated tick-by-tick instead of on `chartLogs`'
refresh cadence, or a Sera deployment/version where `chartLogs` isn't indexed. When that fallback
is actually needed, bucket raw trades yourself:

```
bucketTrades(trades, intervalSeconds):
  group trades by floor(timestamp / intervalSeconds) * intervalSeconds
  for each bucket, in chronological order of trades within it:
    open  = price of first trade in bucket
    high  = max(price) across bucket
    low   = min(price) across bucket
    close = price of last trade in bucket
    volume = sum(amount) across bucket
```

Details that are easy to get wrong:
- **Empty buckets** (no trades in an interval — plausible for a thin market): either omit the
  bucket entirely (most charting libraries handle gaps fine) or carry the previous close forward
  as a flat `open=high=low=close` candle. Pick one and be consistent — silently mixing both
  produces a chart with inconsistent gap semantics.
- **Bucket boundary alignment**: align buckets to fixed epoch boundaries (e.g. every 5-minute
  candle starts at `:00, :05, :10...`), not to "5 minutes after the first trade" — otherwise
  candle boundaries drift and don't match what a user expects from any other FX chart (and don't
  match longer-timeframe aggregation done by combining shorter candles).
- **Aggregating candles into a longer timeframe from a shorter one** (e.g. build 1h candles from
  1m candles instead of re-querying trades) is a valid and often more efficient shortcut — but
  `open` must come from the *first* sub-candle and `close` from the *last*, not from an average.
- **Live/in-progress candle**: the current, not-yet-closed interval's candle updates as new trades
  arrive — treat it as a distinct, continuously-mutating state rather than re-running the full
  bucketing pass on every trade for performance.

## 2. Candlestick rendering basics {#candlestick}

- A candle's **body** spans `open` to `close`; conventionally colored green/white for a bullish
  candle (`close > open`) and red/black for bearish (`close < open`) — this convention is
  extremely well-established in FX/trading UIs, don't invert it without a strong explicit reason.
- The **wick/shadow** lines extend from the body to `high` and `low`.
- Show **volume** as a synchronized bar chart below the price panes when the data is available —
  standard in FX/trading charts and meaningfully informs whether a price move had real
  participation behind it.

## 3. Charting library choice {#library}

For a React + Vite frontend (matching Sera's existing stack), prefer a library with **native
OHLC/candlestick series support** rather than building candles out of a general-purpose chart
library's primitives:

- **`lightweight-charts`** (TradingView, MIT-licensed, canvas-based): purpose-built for
  financial/candlestick charts, has a native `CandlestickSeries`, built-in crosshair/tooltip,
  price-line and trend-line primitives, and is performant with large datasets. This is the
  recommended default for an FX-style chart on top of Sera — it directly matches what the
  reference beginner materials show (candlestick + trend line + moving average on one chart) with
  far less custom drawing code than a general-purpose library would need.
- General-purpose chart libraries (Recharts, etc. — see the separate `dataviz` skill for how to
  use them well) don't have a native candlestick primitive and would need custom SVG/canvas layers
  to render OHLC correctly; only reach for one of these if the project already standardizes on it
  and candlesticks are a minor, occasional need rather than the core UI.

## 4. Trend lines & drawing tools {#trendlines}

A trend line connects two user-selected points (time, price) — typically two swing highs (for a
downtrend/resistance line) or two swing lows (for an uptrend/support line) — and is usually
extended forward to project future support/resistance.

- Model a trend line as `{ id, point1: {time, price}, point2: {time, price}, extendForward: bool
  }` and let the chart library render it as an overlay (`lightweight-charts` supports custom
  primitives/plugins for this).
- **Don't auto-detect trend lines algorithmically unless the user specifically asks for that** —
  in real FX charting tools, trend lines are almost always user-drawn (the trader identifies swing
  points visually), and algorithmic swing-point detection is a much fuzzier, harder-to-get-right
  problem than the manual drawing UI. Default to letting the user click two points; only build
  automatic detection as an explicit, separate feature request.

## 5. Common indicators {#indicators}

- **Simple Moving Average (SMA)**: `SMA[n] = average(close prices of last n candles)`. Recompute
  incrementally (drop the oldest, add the newest) rather than re-summing the whole window on every
  new candle once the window size is non-trivial.
- **Exponential Moving Average (EMA)**: weights recent candles more heavily —
  `EMA[today] = close[today] * k + EMA[yesterday] * (1 - k)`, where `k = 2 / (n + 1)`. Needs a
  seed value (commonly the SMA of the first `n` candles) before the recursive formula applies.
- Both are standard overlays plotted directly on the candlestick pane, not a separate pane.

## 6. Relationship to the `dataviz` skill {#dataviz-relationship}

This file covers the FX-specific data shape and chart type (OHLC bucketing, candlestick rendering
conventions, trend lines). If the task also involves general chart *design quality* — color
palette, dashboard layout, stat tiles, legend/tooltip polish, dark-mode support — combine this
file with the `dataviz` skill, which covers those concerns for any chart type. Use this file to
decide *what to build*; use `dataviz` to decide *how it should look*.
