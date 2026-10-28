# Bulk Trade Stats

Static site (HTML + CSS + JS, no build step, no server), same idea as the Arcus and TxFlow stats sites: paste a wallet address and get its
trading statistics from the public Bulk Exchange API (`mainnet-api1.bulk.trade`, CORS is open). Requests go straight from the visitor's browser.

## What it shows
Net PnL (realized − fees + funding), win rate, profit factor, margin and effective leverage, volume (24h / 7d / 30d / all time), fee tier,
cumulative and daily PnL, daily volume, volume by hour, maker/taker split, average/median holding time, best and worst position,
open positions (with liquidation price), open orders, per-market table, closed positions, funding, deposits/withdrawals, recent fills.
Period bar: all time, 24h, 7d, 30d or a custom GMT range. Cards are toggled with "Cards ⚙". Sub-accounts are listed in the selector.

## How the numbers are built
* `POST /account` with `fullAccount`, `feeTier` and the paginated history types `fills`, `positions`, `fundingHistory`, `activityHistory` (5000 rows per page, newest first, continued by cursor).
* Bulk keeps individual **fills only for a limited time** (for the sample wallet from 8 Oct, while closed positions go back to 12 Sep), so volume, fees,
  funding and PnL are taken from **closed positions** (attributed to the close time). Maker/taker and hour-of-day use the fills that exist and say "fills since …".
* Position volume = total traded size × average of open/close price. Fee sign: negative = paid, positive = rebate.
* PnL is booked when a position is fully closed; unrealized PnL of open positions is shown separately in Margin / Open positions.
* Lifetime totals in the Margin card are the exchange's own numbers and match the sums from closed positions.

## Limitations
* Public rate limit is 5 requests/second per IP (150 burst); the site throttles itself, a large wallet takes a few seconds to load.
* Challenger Aura: `app.bulk.trade/api/challenger-aura/v1/aura/leaderboard` is same-origin only (other sites cannot read it), so the site uses a saved snapshot `aura.json` (all 2,484 wallets: rank, Aura, league, weekly categories). To refresh it, open app.bulk.trade/challenger in a browser and re-download the leaderboard (page_size=500, 5 pages). Wallets missing from the snapshot show "not in the leaderboard".
* No per-slot timestamps for isolated-margin sub-lanes are merged separately; they are included in the master/sub-account view.

## Run locally
    python -m http.server 8801        # inside this folder
    open http://localhost:8801/#ADDRESS

Deep link: `…/#ADDRESS`. Deploy on GitHub Pages like the other sites (`index.html`, `app.js`, `style.css`, `.nojekyll`).

Unofficial project, not affiliated with Bulk.

## Header pill and Aura weeks
* Top-right pill: platform-wide 24h volume and open interest from `GET /stats` (refreshed every 60 s).
* "Challenger Aura · season 1 by week": Season 1 started Sat 10 Oct 2026, 8 weeks, Saturday to Saturday. Challenger week N = mainnet Aura week N + 4.
  Totals are sums of the categories in `aura.json` (a lower bound for the live week, since the snapshot is not live).
* "Rolling volume (14d)" in the Volume card is the wallet's volume over a moving 14-day window; Bulk uses it to pick the fee tier.
