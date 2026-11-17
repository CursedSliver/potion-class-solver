#!/usr/bin/env node
/**
 * Solver regression tests. Run with `npm run test:solver`.
 *
 * The central cases are deliberately impossible for the non-Z3 phases of
 * `solve()` (direct pair assignment and the VERY/PROMISING propagation loop):
 *
 *   1. TRUE BACKBONE
 *      Two COMPLETE potions pin pairs among {4,5}. Three VERY/PROMISING
 *      potions constrain pairs among {0,1,2,3}. Propagation makes zero
 *      changes and leaves pair (0,1) unknown; only Z3's backbone flip tests
 *      prove (0,1) true, which creates the guaranteed triples 0-1-4 and
 *      0-1-5. The test asserts the real solver returns them and that a
 *      propagation-only reference implementation cannot.
 *
 *   2. FALSE BACKBONE
 *      A mirror case where Z3 proves (0,1) false. A solver that treats the
 *      Bool expression as truthy (the old bug) would wrongly emit 0-1-4 and
 *      0-1-5. The test asserts they stay absent.
 *
 * The test also instruments `Context.Solver.check` and requires at least one
 * extra check beyond the initial satisfiability check, so it fails if the
 * backbone phase is skipped. An independent brute-force oracle over all
 * satisfying pair assignments checks the resulting guaranteed triples.
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, 'node_modules', '.cache');

/**
 * Bundle the real TypeScript solver and Z3 bootstrap into a temporary ESM file
 * under node_modules/.cache. Keeping the file inside the project lets Node
 * resolve the external `z3-solver` dependency normally.
 */
async function loadSolverModule() {
  await mkdir(CACHE_DIR, { recursive: true });
  const tempDir = await mkdtemp(join(CACHE_DIR, 'potion-solver-test-'));
  const outfile = join(tempDir, 'solver-module.mjs');
  const solverPath = join(ROOT, 'src', 'solver', 'solver.ts');
  const zPath = join(ROOT, 'src', 'z-solver-ready.ts');
  const reagentsPath = join(ROOT, 'src', 'reagents.ts');
  const source = `
    export { default as solve } from ${JSON.stringify(solverPath)};
    export { PotionResult } from ${JSON.stringify(solverPath)};
    export { begin } from ${JSON.stringify(zPath)};
    export { ReagentCount, ReagentsSortedFromEasyToHard } from ${JSON.stringify(reagentsPath)};
  `;
  try {
    const result = await build({
      stdin: {
        contents: source,
        resolveDir: ROOT,
        sourcefile: 'solver-test-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      packages: 'external',
      logLevel: 'silent',
    });
    await writeFile(outfile, result.outputFiles[0].text);
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const { solve, PotionResult, begin, ReagentCount, ReagentsSortedFromEasyToHard } =
  await loadSolverModule();

const ALL_REAGENTS = [...ReagentsSortedFromEasyToHard];
const YES = 'yes';
const NO = 'no';
const MAYBE = 'maybe';
const COMPLETE = PotionResult.COMPLETE;
const EXTRAORDINARY = PotionResult.EXTRAORDINARY;
const VERY = PotionResult.VERY;
const PROMISING = PotionResult.PROMISING;
const USELESS = PotionResult.USELESS;

let assertions = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  assertions += 1;
}

function pairId(a, b) {
  return a < b ? a * ReagentCount + b : b * ReagentCount + a;
}

function potion(a, b, c, result) {
  const [first, second, third] = [a, b, c].sort((x, y) => x - y);
  return { first, second, third, result };
}

function tripleKey(a, b, c) {
  return [a, b, c].sort((x, y) => x - y).join('-');
}

function normalizePotion(p) {
  return tripleKey(p.first, p.second, p.third);
}

function pairIdsOf(p) {
  return [
    pairId(p.first, p.second),
    pairId(p.first, p.third),
    pairId(p.second, p.third),
  ];
}

function assertSetsEqual(actual, expected, label) {
  const missing = [...expected].filter(value => !actual.has(value));
  const extra = [...actual].filter(value => !expected.has(value));
  assert(
    missing.length === 0 && extra.length === 0,
    `${label}: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`,
  );
}

// ---------------------------------------------------------------------------
// Non-Z3 reference: direct pair assignment + the solver's propagation rules.
// This intentionally re-implements only the phases of solve() that run before
// the Z3 backbone analysis, so the tests can prove a result requires Z3.
// ---------------------------------------------------------------------------

function createTable() {
  const table = new Map();
  for (let a = 0; a < ReagentCount; a++) {
    for (let b = a + 1; b < ReagentCount; b++) {
      table.set(pairId(a, b), MAYBE);
    }
  }
  return table;
}

function pairValue(table, a, b) {
  return table.get(pairId(a, b));
}

function propagationOnly(input) {
  const table = createTable();
  let changes = 0;

  function setPair(a, b, value) {
    const id = pairId(a, b);
    const current = table.get(id);
    if (current === value) {
      return false;
    }
    if (current !== MAYBE) {
      throw new Error('inconsistent outcomes in propagation reference');
    }
    table.set(id, value);
    changes += 1;
    return true;
  }

  const very = [];
  const promising = [];
  for (const p of input) {
    switch (p.result) {
      case COMPLETE:
      case EXTRAORDINARY:
        setPair(p.first, p.second, YES);
        setPair(p.first, p.third, YES);
        setPair(p.second, p.third, YES);
        break;
      case USELESS:
        setPair(p.first, p.second, NO);
        setPair(p.first, p.third, NO);
        setPair(p.second, p.third, NO);
        break;
      case VERY:
        very.push(p);
        break;
      case PROMISING:
        promising.push(p);
        break;
      default:
        break;
    }
  }

  // Direct recordings are not propagation; reset the counter so `changes`
  // only reports values derived by the VERY/PROMISING rules below.
  changes = 0;

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of very) {
      const pairs = [
        [p.first, p.second],
        [p.first, p.third],
        [p.second, p.third],
      ];
      const values = pairs.map(([a, b]) => pairValue(table, a, b));
      const yesCount = values.filter(value => value === YES).length;
      const noCount = values.filter(value => value === NO).length;
      if (noCount > 1 || yesCount === 3) {
        throw new Error('inconsistent VERY constraint in propagation reference');
      }
      if (noCount === 1) {
        for (let i = 0; i < 3; i++) {
          if (values[i] !== YES) {
            changed = setPair(pairs[i][0], pairs[i][1], YES) || changed;
          }
        }
      } else if (yesCount === 2) {
        for (let i = 0; i < 3; i++) {
          if (values[i] === MAYBE) {
            changed = setPair(pairs[i][0], pairs[i][1], NO) || changed;
          }
        }
      }
    }
    for (const p of promising) {
      const pairs = [
        [p.first, p.second],
        [p.first, p.third],
        [p.second, p.third],
      ];
      const values = pairs.map(([a, b]) => pairValue(table, a, b));
      const yesCount = values.filter(value => value === YES).length;
      const noCount = values.filter(value => value === NO).length;
      if (yesCount > 1 || noCount === 3) {
        throw new Error('inconsistent PROMISING constraint in propagation reference');
      }
      if (yesCount === 1) {
        for (let i = 0; i < 3; i++) {
          if (values[i] !== NO) {
            changed = setPair(pairs[i][0], pairs[i][1], NO) || changed;
          }
        }
      } else if (noCount === 2) {
        for (let i = 0; i < 3; i++) {
          if (values[i] === MAYBE) {
            changed = setPair(pairs[i][0], pairs[i][1], YES) || changed;
          }
        }
      }
    }
  }

  return { table, changes };
}

function triangles(table, reagents) {
  const result = new Set();
  for (let i = 0; i < reagents.length; i++) {
    for (let j = i + 1; j < reagents.length; j++) {
      for (let k = j + 1; k < reagents.length; k++) {
        const [a, b, c] = [reagents[i], reagents[j], reagents[k]];
        if (
          pairValue(table, a, b) === YES
          && pairValue(table, a, c) === YES
          && pairValue(table, b, c) === YES
        ) {
          result.add(tripleKey(a, b, c));
        }
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Independent brute-force oracle: enumerate every satisfying assignment for
// the pairs used by a small test case and keep only values fixed in all of
// them (the true backbones). Direct outcomes are fixed; unknown pairs that no
// constraint mentions remain MAYBE.
// ---------------------------------------------------------------------------

function bruteForce(input, reagents) {
  const pairIds = [];
  for (let i = 0; i < reagents.length; i++) {
    for (let j = i + 1; j < reagents.length; j++) {
      pairIds.push(pairId(reagents[i], reagents[j]));
    }
  }
  const values = new Map(pairIds.map(id => [id, MAYBE]));
  const constraints = [];

  function setKnown(id, value) {
    const current = values.get(id);
    if (current === undefined) {
      throw new Error('brute-force universe is missing a recorded pair');
    }
    if (current !== MAYBE && current !== value) {
      return false;
    }
    values.set(id, value);
    return true;
  }

  for (const p of input) {
    const ids = pairIdsOf(p);
    switch (p.result) {
      case COMPLETE:
      case EXTRAORDINARY:
        if (!ids.every(id => setKnown(id, YES))) {
          return { values, unsatisfiable: true };
        }
        break;
      case USELESS:
        if (!ids.every(id => setKnown(id, NO))) {
          return { values, unsatisfiable: true };
        }
        break;
      case VERY:
        constraints.push({ kind: 'very', ids });
        break;
      case PROMISING:
        constraints.push({ kind: 'promising', ids });
        break;
      default:
        break;
    }
  }

  const unknown = pairIds.filter(id => values.get(id) === MAYBE);
  if (unknown.length > 24) {
    throw new Error(
      `brute-force oracle too large (${unknown.length} unknown pairs); keep fixtures small`,
    );
  }
  const indexOf = new Map(unknown.map((id, index) => [id, index]));
  const stableTrue = new Array(unknown.length).fill(true);
  const stableFalse = new Array(unknown.length).fill(true);
  let satCount = 0;

  for (let mask = 0; mask < 2 ** unknown.length; mask++) {
    let ok = true;
    for (const constraint of constraints) {
      let trueCount = 0;
      for (const id of constraint.ids) {
        const known = values.get(id);
        const value = known !== MAYBE
          ? known === YES
          : ((mask >> indexOf.get(id)) & 1) === 1;
        if (value) {
          trueCount += 1;
        }
      }
      if (trueCount !== (constraint.kind === 'very' ? 2 : 1)) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    satCount += 1;
    for (let i = 0; i < unknown.length; i++) {
      if (((mask >> i) & 1) === 1) {
        stableFalse[i] = false;
      } else {
        stableTrue[i] = false;
      }
    }
  }

  if (satCount === 0) {
    return { values, unsatisfiable: true };
  }
  for (let i = 0; i < unknown.length; i++) {
    if (stableTrue[i]) {
      values.set(unknown[i], YES);
    } else if (stableFalse[i]) {
      values.set(unknown[i], NO);
    }
  }
  return { values, unsatisfiable: false };
}

// ---------------------------------------------------------------------------
// Z3 instrumentation. `solve` only needs Context.Solver and the Bool/And/Or/
// Not/Eq helpers, so a proxy can count Solver.check calls while leaving the
// real Z3 context underneath.
// ---------------------------------------------------------------------------

function instrumentContext(context) {
  const BaseSolver = context.Solver;
  let solverCount = 0;
  let checkCount = 0;

  class CountingSolver extends BaseSolver {
    constructor(...args) {
      super(...args);
      solverCount += 1;
    }

    async check(...args) {
      checkCount += 1;
      return super.check(...args);
    }
  }

  const proxy = new Proxy(context, {
    get(target, property) {
      if (property === 'Solver') {
        return CountingSolver;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return {
    context: proxy,
    stats: () => ({ solverCount, checkCount }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures. Both use the same direct pairs among {4,5} and the same
// constraints among {0,1,2,3}, but the constraints force different values for
// pair (0,1).
// ---------------------------------------------------------------------------

const DIRECT_PAIRS = [
  potion(0, 4, 5, COMPLETE),
  potion(1, 4, 5, COMPLETE),
];

const TRUE_BACKBONE_INPUT = [
  ...DIRECT_PAIRS,
  potion(0, 1, 2, VERY),
  potion(0, 1, 3, VERY),
  potion(1, 2, 3, PROMISING),
];

const FALSE_BACKBONE_INPUT = [
  ...DIRECT_PAIRS,
  potion(0, 1, 2, PROMISING),
  potion(0, 1, 3, PROMISING),
  potion(1, 2, 3, VERY),
];

const ORACLE_REAGENTS = [0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main() {
  await run('begin() initializes and caches a real Z3 context', async () => {
    const first = await begin();
    const second = await begin();
    assert(first === second, 'begin() should return the same cached context');
    assert(typeof first.Solver === 'function', 'context.Solver is missing');
    assert(typeof first.Bool?.const === 'function', 'context.Bool.const is missing');
  });

  await run('Z3-only true backbone yields 0-1-4 and 0-1-5', async () => {
    const instrumented = instrumentContext(await begin());
    const result = await solve(
      new Set(TRUE_BACKBONE_INPUT),
      20,
      ALL_REAGENTS,
      Promise.resolve(instrumented.context),
    );
    const { solverCount, checkCount } = instrumented.stats();
    assert(solverCount >= 1, 'solve() did not create a Z3 Solver');
    assert(checkCount >= 2, `expected backbone flip checks, saw only ${checkCount} check() calls`);

    const actual = new Set([...result.extraordinary].map(normalizePotion));
    assert(actual.has('0-1-4'), 'missing the Z3-derived guaranteed triple 0-1-4');
    assert(actual.has('0-1-5'), 'missing the Z3-derived guaranteed triple 0-1-5');

    const oracle = bruteForce(TRUE_BACKBONE_INPUT, ORACLE_REAGENTS);
    assert(!oracle.unsatisfiable, 'oracle unexpectedly found the fixture unsatisfiable');
    const expected = triangles(oracle.values, ORACLE_REAGENTS);
    assertSetsEqual(actual, expected, 'guaranteed triples vs brute-force oracle');

    const baseline = propagationOnly(TRUE_BACKBONE_INPUT);
    assert(
      baseline.changes === 0,
      `propagation-only reference made ${baseline.changes} change(s); this fixture should require Z3`,
    );
    assert(
      pairValue(baseline.table, 0, 1) === MAYBE,
      'propagation-only reference already resolved pair 0-1',
    );
    const baselineTriples = triangles(baseline.table, ORACLE_REAGENTS);
    assert(!baselineTriples.has('0-1-4'), 'propagation-only reference already produced 0-1-4');
    assert(!baselineTriples.has('0-1-5'), 'propagation-only reference already produced 0-1-5');
    assert(
      baselineTriples.has('0-4-5') && baselineTriples.has('1-4-5'),
      'propagation-only reference lost the directly recorded triangles',
    );
  });

  await run('pairingTable exposes every unordered pair with known values', async () => {
    const result = await solve(new Set(TRUE_BACKBONE_INPUT), 5, ALL_REAGENTS, begin());
    const { yes, no, maybe } = result.truthinessObjects;
    let total = 0;
    for (let y = 0; y < ReagentCount; y++) {
      assert(
        result.pairingTable[y].length === y,
        `pairingTable row ${y} has ${result.pairingTable[y].length} cells, expected ${y}`,
      );
      for (let x = 0; x < y; x++) {
        const cell = result.pairingTable[y][x];
        total += 1;
        assert(
          cell === yes || cell === no || cell === maybe,
          `pairingTable[${y}][${x}] is not one of the solver truth values`,
        );
      }
    }
    assert(
      total === (ReagentCount * (ReagentCount - 1)) / 2,
      `pairingTable covers ${total} pairs, expected ${(ReagentCount * (ReagentCount - 1)) / 2}`,
    );
    // The two complete potions resolve 0-4, 0-5 and 4-5 (plus 1-4, 1-5),
    // while Z3's backbone proves 0-1 true.
    for (const [x, y] of [[0, 4], [0, 5], [4, 5], [1, 4], [1, 5], [0, 1]]) {
      assert(
        result.pairingTable[y][x] === yes,
        `pairingTable[${y}][${x}] should be yes`,
      );
    }
  });

  await run('Z3-only false backbone keeps 0-1-4 and 0-1-5 impossible', async () => {
    const instrumented = instrumentContext(await begin());
    const result = await solve(
      new Set(FALSE_BACKBONE_INPUT),
      20,
      ALL_REAGENTS,
      Promise.resolve(instrumented.context),
    );
    const { solverCount, checkCount } = instrumented.stats();
    assert(solverCount >= 1, 'solve() did not create a Z3 Solver');
    assert(checkCount >= 2, `expected backbone flip checks, saw only ${checkCount} check() calls`);

    const oracle = bruteForce(FALSE_BACKBONE_INPUT, ORACLE_REAGENTS);
    assert(!oracle.unsatisfiable, 'oracle unexpectedly found the fixture unsatisfiable');
    assert(
      oracle.values.get(pairId(0, 1)) === NO,
      'oracle did not prove pair 0-1 false',
    );
    const actual = new Set([...result.extraordinary].map(normalizePotion));
    assert(!actual.has('0-1-4'), 'a false backbone was treated as true: 0-1-4 appeared');
    assert(!actual.has('0-1-5'), 'a false backbone was treated as true: 0-1-5 appeared');
    assertSetsEqual(actual, triangles(oracle.values, ORACLE_REAGENTS), 'false-backbone output vs oracle');

    const baseline = propagationOnly(FALSE_BACKBONE_INPUT);
    assert(
      pairValue(baseline.table, 0, 1) === MAYBE,
      'propagation-only reference unexpectedly resolved pair 0-1',
    );
  });

  await run('recommendations use only unresolved, pair-disjoint triples', async () => {
    const result = await solve(new Set(TRUE_BACKBONE_INPUT), 5, ALL_REAGENTS, begin());
    const oracle = bruteForce(TRUE_BACKBONE_INPUT, ORACLE_REAGENTS);
    const usedPairs = new Set();
    assert(
      result.recommendedForMaxInfo.size <= 5,
      `recommendation cap exceeded: ${result.recommendedForMaxInfo.size}`,
    );
    for (const recommendation of result.recommendedForMaxInfo) {
      assert(
        new Set([recommendation.first, recommendation.second, recommendation.third]).size === 3,
        `recommendation has duplicate reagents: ${normalizePotion(recommendation)}`,
      );
      for (const id of pairIdsOf(recommendation)) {
        const value = oracle.values.get(id) ?? MAYBE;
        assert(
          value === MAYBE,
          `recommendation ${normalizePotion(recommendation)} uses resolved pair ${id}`,
        );
        assert(!usedPairs.has(id), `recommendations share pair ${id}`);
        usedPairs.add(id);
      }
    }
  });

  await run('recommendationsCount = 0 suppresses recommendations only', async () => {
    const result = await solve(new Set(TRUE_BACKBONE_INPUT), 0, ALL_REAGENTS, begin());
    assert(
      result.recommendedForMaxInfo.size === 0,
      `cap 0 returned ${result.recommendedForMaxInfo.size} recommendation(s)`,
    );
    const guaranteed = new Set([...result.extraordinary].map(normalizePotion));
    assert(guaranteed.has('0-1-4'), 'cap 0 lost guaranteed triple 0-1-4');
    assert(guaranteed.has('0-1-5'), 'cap 0 lost guaranteed triple 0-1-5');
  });

  await run('directly recorded triangles still resolve without backbones', async () => {
    const input = [potion(0, 1, 2, COMPLETE)];
    const result = await solve(new Set(input), 5, ALL_REAGENTS, begin());
    const oracle = bruteForce(input, [0, 1, 2]);
    assert(!oracle.unsatisfiable, 'oracle unexpectedly found the direct fixture unsatisfiable');
    assertSetsEqual(
      new Set([...result.extraordinary].map(normalizePotion)),
      triangles(oracle.values, [0, 1, 2]),
      'direct-triangle output vs oracle',
    );
  });

  await run('contradictory recorded outcomes are rejected', async () => {
    const input = [
      potion(0, 1, 2, COMPLETE),
      potion(0, 1, 3, USELESS),
    ];
    let error = null;
    try {
      await solve(new Set(input), 5, ALL_REAGENTS, begin());
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof Error, 'solve() should reject contradictory outcomes');
    assert(
      /inconsistent/i.test(error.message),
      `expected an inconsistency error, got: ${error.message}`,
    );
  });

  await run('empty input with cap 0 returns nothing', async () => {
    const result = await solve(new Set(), 0, ALL_REAGENTS, begin());
    assert(result.extraordinary.size === 0, 'empty input produced guaranteed triples');
    assert(result.recommendedForMaxInfo.size === 0, 'empty input produced recommendations');
  });

  console.log(`\nAll solver tests passed (${assertions} assertions).`);
}

try {
  await main();
} catch {
  console.error('\nSolver tests failed.');
  process.exitCode = 1;
}
