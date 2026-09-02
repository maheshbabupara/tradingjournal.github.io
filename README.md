# Trade Ledger — iPhone setup

This is an installable Progressive Web App. Put this whole folder on an HTTPS static host (GitHub Pages, Cloudflare Pages, Netlify, or your own web host). Safari enables installation and reliable offline storage only for a website served over HTTPS.

When the site has a public HTTPS address:

1. Open it in **Safari** on your iPhone.
2. Tap **Share** (the square with the upward arrow).
3. Choose **Add to Home Screen**.
4. Name it `Trade Ledger`, then tap **Add**.

It will open like an app. Entries are stored on that specific device, so use **Export data** periodically as a backup. Import the backup or original CSV on a new device.

## Import and calculation rules

The CSV's values are normalized during calculation:

| Outcome | Trade P&L before charges | Net result |
| --- | --- | --- |
| WIN | positive amount | amount minus charges |
| LOSS | positive amount | negative amount minus charges |
| BREAKEVEN | ignored | negative charges only |
| NO TRADE / MISSED OPPORTUNITY | ignored | no performance P&L |

Charges are always a cost, even when the CSV displays them as a negative number.
