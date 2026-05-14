// Pure helpers split out from queries.ts so unit tests can import them
// without pulling in the Drizzle client.

export interface RollupTotals {
  avgAttendance: number;
  offerings: number;
  tithes: number;
  thanksgiving: number;
  others: number;
  total: number;
  expectedRegionalOffering5: number;
  expectedRegionalTithe20: number;
  expectedRegionalTotal: number;
}

export interface SummableRow {
  avgAttendance: number;
  offerings: number;
  tithes: number;
  thanksgiving: number;
  others: number;
  total: number;
  expectedRegionalOffering5: number;
  expectedRegionalTithe20: number;
  expectedRegionalTotal: number;
}

const ZERO_TOTALS: RollupTotals = {
  avgAttendance: 0,
  offerings: 0,
  tithes: 0,
  thanksgiving: 0,
  others: 0,
  total: 0,
  expectedRegionalOffering5: 0,
  expectedRegionalTithe20: 0,
  expectedRegionalTotal: 0,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sum the columns of a set of rollup rows. avgAttendance sums as
 * integers (matching the original spreadsheet's footer: 346 = sum of
 * per-parish averages, not a re-average).
 */
export function sumTotals(rows: ReadonlyArray<SummableRow>): RollupTotals {
  return rows.reduce(
    (acc, r) => ({
      avgAttendance: acc.avgAttendance + r.avgAttendance,
      offerings: round2(acc.offerings + r.offerings),
      tithes: round2(acc.tithes + r.tithes),
      thanksgiving: round2(acc.thanksgiving + r.thanksgiving),
      others: round2(acc.others + r.others),
      total: round2(acc.total + r.total),
      expectedRegionalOffering5: round2(
        acc.expectedRegionalOffering5 + r.expectedRegionalOffering5,
      ),
      expectedRegionalTithe20: round2(acc.expectedRegionalTithe20 + r.expectedRegionalTithe20),
      expectedRegionalTotal: round2(acc.expectedRegionalTotal + r.expectedRegionalTotal),
    }),
    { ...ZERO_TOTALS },
  );
}
