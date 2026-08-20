import { describe, expect, it } from 'vitest';
import { analyzeInvestment, monthlyMortgagePayment } from './investment.js';

describe('monthlyMortgagePayment', () => {
  it('matches the standard amortization figure', () => {
    // $400,000 at 6.5% over 30 years is $2,528.27 on any mortgage calculator.
    expect(monthlyMortgagePayment(400_000, 6.5, 30)).toBeCloseTo(2528.27, 2);
  });

  it('falls back to straight-line repayment at a zero rate', () => {
    expect(monthlyMortgagePayment(360_000, 0, 30)).toBeCloseTo(1000, 6);
  });

  it('is zero for an all-cash purchase', () => {
    expect(monthlyMortgagePayment(0, 6.5, 30)).toBe(0);
  });

  it('costs more per month over a shorter term', () => {
    const thirty = monthlyMortgagePayment(400_000, 6.5, 30);
    const fifteen = monthlyMortgagePayment(400_000, 6.5, 15);
    expect(fifteen).toBeGreaterThan(thirty);
  });
});

describe('analyzeInvestment', () => {
  const base = { purchasePrice: 500_000, monthlyRent: 3_500 };

  it('derives the loan from the down payment', () => {
    const r = analyzeInvestment({ ...base, downPaymentPct: 20 });
    expect(r.downPayment).toBe(100_000);
    expect(r.loanAmount).toBe(400_000);
  });

  it('counts closing costs as cash invested', () => {
    const r = analyzeInvestment({ ...base, downPaymentPct: 20, closingCostPct: 3 });
    // $100,000 down plus 3% of $500,000.
    expect(r.totalCashInvested).toBe(115_000);
  });

  it('excludes debt service from NOI but not from cash flow', () => {
    const r = analyzeInvestment(base);
    const annualDebtService = r.monthlyExpenses.mortgagePrincipalAndInterest * 12;
    expect(r.annualNoi - annualDebtService).toBeCloseTo(r.annualCashFlow, 1);
  });

  it('reports cap rate independent of financing', () => {
    const leveraged = analyzeInvestment({ ...base, downPaymentPct: 20 });
    const allCash = analyzeInvestment({ ...base, downPaymentPct: 100 });
    expect(leveraged.capRatePct).toBeCloseTo(allCash.capRatePct, 6);
  });

  it('treats vacancy as an operating expense, leaving gross rent intact', () => {
    const r = analyzeInvestment({ ...base, vacancyRate: 5 });
    expect(r.monthlyRent).toBe(3_500);
    expect(r.monthlyExpenses.vacancyReserve).toBeCloseTo(175, 2);
  });

  it('sums the expense breakdown to the reported total', () => {
    const e = analyzeInvestment(base).monthlyExpenses;
    const parts =
      e.mortgagePrincipalAndInterest +
      e.propertyTax +
      e.insurance +
      e.maintenance +
      e.vacancyReserve +
      e.hoa;
    expect(parts).toBeCloseTo(e.total, 1);
  });

  it('flags negative cash flow', () => {
    const r = analyzeInvestment({ purchasePrice: 900_000, monthlyRent: 2_000 });
    expect(r.monthlyCashFlow).toBeLessThan(0);
    expect(r.cashFlowPositive).toBe(false);
  });

  it('computes the gross rent multiplier', () => {
    const r = analyzeInvestment({ purchasePrice: 600_000, monthlyRent: 4_000 });
    expect(r.grossRentMultiplier).toBeCloseTo(12.5, 2);
  });

  it('returns null GRM rather than dividing by zero when there is no rent', () => {
    const r = analyzeInvestment({ purchasePrice: 600_000, monthlyRent: 0 });
    expect(r.grossRentMultiplier).toBeNull();
  });

  it('does not divide by zero when the buyer invests no cash', () => {
    const r = analyzeInvestment({
      ...base,
      downPaymentPct: 0,
      closingCostPct: 0,
    });
    expect(Number.isFinite(r.cashOnCashReturnPct)).toBe(true);
  });

  it('rejects a zero purchase price instead of returning Infinity', () => {
    expect(() => analyzeInvestment({ purchasePrice: 0, monthlyRent: 3_000 })).toThrow();
  });

  it('rejects negative rent', () => {
    expect(() =>
      analyzeInvestment({ purchasePrice: 500_000, monthlyRent: -1 }),
    ).toThrow();
  });

  it('applies documented defaults when only price and rent are given', () => {
    const r = analyzeInvestment(base);
    expect(r.downPayment).toBe(100_000); // 20%
    expect(r.monthlyExpenses.insurance).toBeCloseTo(125, 2); // $1,500/yr
    expect(r.monthlyExpenses.propertyTax).toBeCloseTo(458.33, 2); // 1.1%
  });
});
