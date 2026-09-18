/* ============================================================
 * LOAN DATA — this is the only file you need to edit.
 *
 * To record a payment:
 *   1. Open this file on GitHub and click the pencil (Edit) icon
 *   2. Add a line to the PAYMENTS list below, newest at the bottom:
 *        { date: "2026-10-15", amount: 500 },
 *      (date is YYYY-MM-DD; don't forget the comma at the end)
 *   3. Click "Commit changes". The dashboard updates itself.
 *
 * NOTE: the numbers below are SAMPLE DATA. Replace them with
 * the real loan terms and real payments.
 * ============================================================ */

const LOAN = {
  lender: "Dad",
  borrower: "Steve",
  principal: 25000,        // amount originally lent, in dollars
  annualRatePct: 5,        // yearly interest rate (0 for interest-free)
  startDate: "2025-06-01", // day the money was handed over (YYYY-MM-DD)
  scheduledPayment: 500,   // agreed monthly payment, in dollars
  paymentDayOfMonth: 15,   // day of the month a payment is expected
};

const PAYMENTS = [
  // { date: "YYYY-MM-DD", amount: dollars, note: "optional" },
  { date: "2025-06-15", amount: 500 },
  { date: "2025-07-15", amount: 500 },
  { date: "2025-08-15", amount: 500 },
  { date: "2025-09-14", amount: 750, note: "extra from bonus" },
  { date: "2025-10-15", amount: 500 },
  { date: "2025-11-17", amount: 500 },
  { date: "2025-12-15", amount: 500 },
  { date: "2026-01-15", amount: 500 },
  { date: "2026-02-16", amount: 500 },
  { date: "2026-03-16", amount: 500 },
  { date: "2026-04-15", amount: 1000, note: "tax refund" },
  { date: "2026-05-15", amount: 500 },
  { date: "2026-06-15", amount: 500 },
  { date: "2026-07-15", amount: 500 },
  { date: "2026-08-17", amount: 500 },
];
