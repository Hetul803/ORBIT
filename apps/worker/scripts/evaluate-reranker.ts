import { readFile } from 'node:fs/promises';

interface CandidateFixture {
  readonly id: string;
  readonly profile: string;
}

interface EvaluationFixture {
  readonly id: string;
  readonly intent: string;
  readonly positiveHistory: string;
  readonly negativeHistory: string;
  readonly expectedWinner: string;
  readonly candidates: readonly CandidateFixture[];
}

const words = (value: string): Set<string> =>
  new Set(value.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []);

const overlap = (left: string, right: string): number => {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  return [...a].filter((word) => b.has(word)).length / Math.sqrt(a.size * b.size);
};

const baselineScore = (fixture: EvaluationFixture, candidate: CandidateFixture): number =>
  overlap(fixture.intent, candidate.profile);

const conditionedScore = (fixture: EvaluationFixture, candidate: CandidateFixture): number =>
  baselineScore(fixture, candidate) +
  overlap(fixture.positiveHistory, candidate.profile) * 0.55 -
  overlap(fixture.negativeHistory, candidate.profile) * 0.35;

const winner = (
  fixture: EvaluationFixture,
  score: (fixture: EvaluationFixture, candidate: CandidateFixture) => number,
): string | undefined =>
  fixture.candidates.toSorted((a, b) => score(fixture, b) - score(fixture, a))[0]?.id;

const main = async (): Promise<void> => {
  const url = new URL('../eval/reranker-cases.json', import.meta.url);
  const fixtures = JSON.parse(await readFile(url, 'utf8')) as EvaluationFixture[];
  const rows = fixtures.map((fixture) => ({
    id: fixture.id,
    expectedWinner: fixture.expectedWinner,
    baselineWinner: winner(fixture, baselineScore),
    conditionedWinner: winner(fixture, conditionedScore),
  }));
  const correct = (field: 'baselineWinner' | 'conditionedWinner'): number =>
    rows.filter((row) => row[field] === row.expectedWinner).length;
  const baselineCorrect = correct('baselineWinner');
  const conditionedCorrect = correct('conditionedWinner');
  const report = {
    dataset: 'apps/worker/eval/reranker-cases.json',
    cases: rows.length,
    baselineAccuracy: baselineCorrect / rows.length,
    outcomeConditionedAccuracy: conditionedCorrect / rows.length,
    upliftPercentagePoints: ((conditionedCorrect - baselineCorrect) / rows.length) * 100,
    rows,
    caveat:
      'Deterministic offline fixtures; production quality still requires live outcome volume.',
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (conditionedCorrect < baselineCorrect) process.exitCode = 1;
};

await main();
