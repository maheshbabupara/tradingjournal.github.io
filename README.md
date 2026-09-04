# Trade Ledger

An iPhone-first PWA backed by the Oracle ORDS Trading Journal API.

## iPhone installation

Deploy this folder to an HTTPS static host. Open the resulting URL in Safari on the iPhone, tap **Share**, then **Add to Home Screen**. The iPhone app uses the same remote trading-journal database, so no manual CSV import is needed.

## API mapping

The app reads all pages from `getTrades`, opens individual records with `getTrade/:id`, creates records with `createTrade`, and updates records with `PUT getTrade/:id`.

It sends JSON fields: `trade_on`, `trade_result`, `pl`, `charges`, `notes`, `trade_rules`, and `archived`.

## Equity projections

The projection screen bootstraps 4,000 deterministic simulation paths from the journal's active trading days. Multiple trades on the same date are aggregated using the same net P&L calculation as the dashboard; archived entries, observations, and missed opportunities are excluded. The displayed downside, median, and upside values are the 10th, 50th, and 90th percentiles of the terminal simulated equity.

At least five active trading days are required before a range is shown. The result is a probabilistic scenario based on the recorded sample, not a guarantee or a forecast of market prices. A larger and more representative journal history produces a more informative range.

The form submits positive `pl` and `charges` amounts. The visualized net result is calculated as:

- WIN: `pl - charges`
- LOSS: `-pl - charges`
- BREAKEVEN: `-charges`
- NO TRADE / MISSED OPPORTUNITY: excluded from performance P&L

## Required ORDS configuration

Because this PWA will be hosted on a different HTTPS domain, ORDS must allow browser CORS requests from that exact deployed origin. Allow `GET`, `POST`, `PUT`, and the `Content-Type` request header; its OPTIONS preflight must respond successfully. Do not use `Access-Control-Allow-Origin: *` if the API will later require authentication—use your deployed site’s exact URL instead.

For `POST` and `PUT`, return either JSON or an empty successful response with status `201` / `200`. The app accepts either, but error responses should return a meaningful body and a 4xx/5xx status.
