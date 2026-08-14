import { z } from 'zod';

/**
 * Buy-and-hold investment analysis.
 *
 * Every number here is derived arithmetically from the inputs. Nothing in this
 * module calls a model, a pricing API, or the network, which is deliberate: an
 * agent presenting cap rate and cash flow to a client is presenting figures the
 * client may act on, so they have to be reproducible and auditable rather than
 * estimated. If a caller lacks a real input, it should collect one rather than
 * accept a guess.
 *
 * Dollar results are rounded to cents. Rates are returned as percentages
 * (`6.5` means 6.5%), matching how agents read and quote them.
 */

export const investmentInputSchema = z.object({
  /** Contract price. Must be positive; cap rate is undefined at zero. */
  purchasePrice: z.number().positive(),
  /** Gross scheduled rent before vacancy and expenses. */
  monthlyRent: z.number().nonnegative(),
  downPaymentPct: z.number().min(0).max(100).default(20),
  /** Annual nominal rate, e.g. 6.5 for 6.5%. */
  interestRate: z.number().min(0).max(100).default(6.5),
  loanTermYears: z.number().int().positive().max(50).default(30),
  /** Annual property tax as a percent of purchase price. */
  propertyTaxRate: z.number().min(0).max(100).default(1.1),
  insuranceAnnual: z.number().nonnegative().default(1500),
  /** Annual maintenance reserve as a percent of purchase price. */
  maintenancePct: z.number().min(0).max(100).default(1),
  /** Expected vacancy as a percent of gross rent. */
  vacancyRate: z.number().min(0).max(100).default(5),
  hoaMonthly: z.number().nonnegative().default(0),
  /** Closing costs as a percent of purchase price, part of cash invested. */
  closingCostPct: z.number().min(0).max(100).default(3),
});

export type InvestmentInput = z.input<typeof investmentInputSchema>;
export type ResolvedInvestmentInput = z.output<typeof investmentInputSchema>;

export interface MonthlyExpenses {
  mortgagePrincipalAndInterest: number;
  propertyTax: number;
  insurance: number;
  maintenance: number;
  vacancyReserve: number;
  hoa: number;
  total: number;
}

export interface InvestmentAnalysis {
  purchasePrice: number;
  downPayment: number;
  loanAmount: number;
  totalCashInvested: number;
  monthlyRent: number;
  monthlyExpenses: MonthlyExpenses;
  monthlyCashFlow: number;
  annualCashFlow: number;
  /** Net operating income. Excludes debt service, by definition. */
  annualNoi: number;
  capRatePct: number;
  cashOnCashReturnPct: number;
  /** Gross rent multiplier. `null` when there is no rent to divide into. */
  grossRentMultiplier: number | null;
  cashFlowPositive: boolean;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Standard amortizing payment for principal and interest.
 *
 * The closed form divides by zero at a 0% rate, so that case falls back to
 * straight-line repayment. All-cash purchases produce a zero principal and
 * therefore a zero payment, which the formula already handles.
 */
export function monthlyMortgagePayment(
  principal: number,
  annualRatePct: number,
  termYears: number,
): number {
  if (principal <= 0) return 0;
  const payments = termYears * 12;
  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) return principal / payments;
  const growth = Math.pow(1 + monthlyRate, payments);
  return (principal * (monthlyRate * growth)) / (growth - 1);
}

/**
 * Run the full analysis.
 *
 * Vacancy is treated as an operating expense rather than a reduction in rent,
 * so `monthlyRent` stays the gross scheduled figure an agent would quote and
 * the vacancy assumption remains visible as its own line in the breakdown.
 */
export function analyzeInvestment(input: InvestmentInput): InvestmentAnalysis {
  const i = investmentInputSchema.parse(input);

  const downPayment = i.purchasePrice * (i.downPaymentPct / 100);
  const loanAmount = i.purchasePrice - downPayment;

  const mortgage = monthlyMortgagePayment(
    loanAmount,
    i.interestRate,
    i.loanTermYears,
  );
  const propertyTax = (i.purchasePrice * (i.propertyTaxRate / 100)) / 12;
  const insurance = i.insuranceAnnual / 12;
  const maintenance = (i.purchasePrice * (i.maintenancePct / 100)) / 12;
  const vacancyReserve = i.monthlyRent * (i.vacancyRate / 100);

  const operatingExpenses =
    propertyTax + insurance + maintenance + vacancyReserve + i.hoaMonthly;
  const totalMonthly = operatingExpenses + mortgage;

  const monthlyCashFlow = i.monthlyRent - totalMonthly;
  const annualNoi = i.monthlyRent * 12 - operatingExpenses * 12;
  const cashInvested =
    downPayment + i.purchasePrice * (i.closingCostPct / 100);
  const annualGrossRent = i.monthlyRent * 12;

  return {
    purchasePrice: roundCents(i.purchasePrice),
    downPayment: roundCents(downPayment),
    loanAmount: roundCents(loanAmount),
    totalCashInvested: roundCents(cashInvested),
    monthlyRent: roundCents(i.monthlyRent),
    monthlyExpenses: {
      mortgagePrincipalAndInterest: roundCents(mortgage),
      propertyTax: roundCents(propertyTax),
      insurance: roundCents(insurance),
      maintenance: roundCents(maintenance),
      vacancyReserve: roundCents(vacancyReserve),
      hoa: roundCents(i.hoaMonthly),
      total: roundCents(totalMonthly),
    },
    monthlyCashFlow: roundCents(monthlyCashFlow),
    annualCashFlow: roundCents(monthlyCashFlow * 12),
    annualNoi: roundCents(annualNoi),
    capRatePct: roundCents((annualNoi / i.purchasePrice) * 100),
    cashOnCashReturnPct:
      cashInvested > 0
        ? roundCents(((monthlyCashFlow * 12) / cashInvested) * 100)
        : 0,
    grossRentMultiplier:
      annualGrossRent > 0
        ? roundCents(i.purchasePrice / annualGrossRent)
        : null,
    cashFlowPositive: monthlyCashFlow > 0,
  };
}
