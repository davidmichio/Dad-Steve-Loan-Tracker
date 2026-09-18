# Dad ↔ Steve Loan Tracker

A single-page dashboard that tracks the loan between Dad and Steve — current
balance, a paid-off meter, balance-over-time and payment charts, and the full
payment history. No build step, no dependencies: it's plain HTML/CSS/JS served
by GitHub Pages.

## One-time setup (turn on GitHub Pages)

1. Merge this branch into `main` (or push these files to `main`).
2. On GitHub go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   pick branch **`main`** and folder **`/ (root)`**, and click **Save**.
4. After a minute the site is live at
   `https://davidmichio.github.io/Dad-Steve-Loan-Tracker/` — send that link to
   Dad and Steve.

> Note: GitHub Pages on a free personal account requires the repository to be
> **public**, which means the page is visible to anyone with the link. If the
> numbers should stay private, make the repo private and use a paid GitHub
> plan, or keep the link unlisted and the names generic.

## Entering the real loan terms

All the numbers live in one file: [`data.js`](data.js). It currently contains
**sample data** — replace it with the real terms:

```js
const LOAN = {
  lender: "Dad",
  borrower: "Steve",
  principal: 25000,        // amount originally lent
  annualRatePct: 5,        // yearly interest rate (0 for interest-free)
  startDate: "2025-06-01", // day the money was handed over
  scheduledPayment: 500,   // agreed monthly payment
  paymentDayOfMonth: 15,   // day of the month a payment is expected
};
```

## Recording a payment

1. Open `data.js` on GitHub and click the pencil (**Edit**) icon.
2. Add one line to the bottom of the `PAYMENTS` list:
   ```js
   { date: "2026-10-15", amount: 500 },
   ```
   Add a note if you like: `{ date: "2026-10-15", amount: 750, note: "extra" },`
3. Click **Commit changes**. The dashboard updates itself within a minute.

## How the math works

Interest accrues daily (simple interest, actual/365) on the outstanding
principal. Each payment covers accrued interest first; the remainder reduces
principal. The table shows the split and the balance after every payment, and
the "Est. payoff" tile projects how many months remain at the scheduled
monthly payment.

## Files

| File | What it is |
|---|---|
| `data.js` | **The only file you edit** — loan terms + payment log |
| `index.html` | Page structure |
| `styles.css` | Dark high-tech theme (green/black, Roboto Mono) |
| `app.js` | Interest math, charts, tables — no libraries |
