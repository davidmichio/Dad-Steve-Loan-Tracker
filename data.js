/* ============================================================
 * LOAN TERMS — the dashboard computes everything else itself.
 *
 * Payments are assumed to happen once a month, every month,
 * starting with firstPaymentMonth, until the loan is paid off.
 * The page counts how many months have elapsed each time it
 * loads, so nothing here needs editing month to month.
 *
 * If a payment is ever skipped or an extra amount is paid,
 * add it to "adjustments" (positive = extra paid, negative =
 * a missed month), e.g.:
 *   adjustments: [ { date: "2027-03-01", amount: -400, note: "skipped March" } ]
 * ============================================================ */

const TRACKER = {
  finalDueDate: "2044-09-30",   // remaining balances due in full on this date

  loans: [
    {
      name: "Uncle Steve",
      principal: 95000,          // amount borrowed
      monthlyPayment: 400,
      startMonth: "2024-10",     // loan initiated
      firstPaymentMonth: "2024-12",
      paymentDayOfMonth: 1,      // the month counts as paid on/after this day
      adjustments: [],
    },
    {
      name: "Mom & Dad",
      principal: 70000,
      monthlyPayment: 250,
      startMonth: "2024-10",
      firstPaymentMonth: "2024-12",
      paymentDayOfMonth: 1,
      adjustments: [],
    },
  ],
};
