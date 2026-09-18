# Loan Tracker

A single-page dashboard that tracks personal loans — how much has been paid,
how much remains, percent paid off, and the payoff timeline out to the final
due date. No build step, no dependencies: plain HTML/CSS/JS served by GitHub
Pages.

**It updates itself.** Payments happen once a month on a fixed schedule, so
the page counts the months elapsed every time someone visits and recalculates
the current status. Nothing needs to be edited month to month.

## One-time setup (turn on GitHub Pages)

1. Get these files onto the repository's default branch (`main`).
2. On GitHub go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   pick branch **`main`** and folder **`/ (root)`**, and click **Save**.
4. After a minute the site is live at the URL shown on that settings page —
   share that link.

## Changing the numbers

All loan terms and milestones live in [`data.js`](data.js). If a month is
skipped or an extra amount is paid, add an entry to that loan's
`adjustments` list (positive = extra paid, negative = missed):

```js
adjustments: [
  { date: "2027-03-01", amount: -400, note: "skipped March" },
  { date: "2027-06-01", amount: 1000, note: "extra payment" },
],
```

Commit the change on GitHub and the dashboard picks it up.

## Files

| File | What it is |
|---|---|
| `data.js` | Loan terms, milestones, and optional adjustments — the only file to edit |
| `index.html` | Page structure |
| `styles.css` | Dark high-tech theme (green/black, Roboto Mono) |
| `app.js` | Schedule math, charts, and the line drawing — no libraries |
