# Trade Ledger

An iPhone-first PWA backed by the Oracle ORDS Trading Journal API.

## iPhone installation

Deploy this folder to an HTTPS static host. Open the resulting URL in Safari on the iPhone, tap **Share**, then **Add to Home Screen**. The iPhone app uses the same remote trading-journal database, so no manual CSV import is needed.

## API mapping

The app reads all pages from `getTrades`, opens individual records with `getTrade/:id`, creates records with `createTrade`, and updates records with `PUT getTrade/:id`.

It sends JSON fields: `trade_on`, `trade_result`, `pl`, `charges`, `notes`, `trade_rules`, and `archived`.

The form submits positive `pl` and `charges` amounts. The visualized net result is calculated as:

- WIN: `pl - charges`
- LOSS: `-pl - charges`
- BREAKEVEN: `-charges`
- NO TRADE / MISSED OPPORTUNITY: excluded from performance P&L

## Required ORDS configuration

Because this PWA will be hosted on a different HTTPS domain, ORDS must allow browser CORS requests from that exact deployed origin. Allow `GET`, `POST`, `PUT`, and the `Content-Type` request header; its OPTIONS preflight must respond successfully. Do not use `Access-Control-Allow-Origin: *` if the API will later require authentication—use your deployed site’s exact URL instead.

For `POST` and `PUT`, return either JSON or an empty successful response with status `201` / `200`. The app accepts either, but error responses should return a meaningful body and a 4xx/5xx status.
