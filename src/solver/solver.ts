// Imports: set of potion info (complete, extraordinary, very, promising, useless)
import { Reagent, ReagentCount } from '../reagents';
import type { Z3Context } from '../z-solver-ready';

export enum PotionResult {
    COMPLETE,
    EXTRAORDINARY,
    VERY,
    PROMISING,
    USELESS,
    UNKNOWN
}
export interface Potion {
    first: Reagent;
    second: Reagent;
    third: Reagent;
    result: PotionResult;
}

/** One cell of the pair-truth table: yes, no, or unknown (maybe). */
export interface PairingTruth {
    description: string;
}
export interface SolveResult {
    extraordinary: Set<Potion>,
    recommendedForMaxInfo: Set<Potion>,
    truthinessObjects: Readonly<{
        yes: { description: 'Goes together in one or more potions' },
        no: { description: 'Does not go together in any potion' },
        maybe: { description: 'No information available about this combination' }
    }>,
    /** `pairingTable[larger][smaller]` for every unordered reagent pair. */
    pairingTable: PairingTruth[][]
}
async function solve(potions: Set<Potion>, recommendationsCount: number, reagentsSortedFromEasyToHard: Reagent[], zSolver: Promise<Z3Context>): Promise<SolveResult> {
    const z = await zSolver;
    // Given potions return min.extraordinarily promising potions

    // NOTE: each potion in potions must have the reagents arranged such that first < second < third in the Reagent list
    // This code reorders
    potions = (() => {
        let updated: Set<Potion> = new Set();
        for (const p of potions) {
            const sorted = [p.first, p.second, p.third].sort((a, b) => a - b);
            updated.add({
                first: sorted[0],
                second: sorted[1],
                third: sorted[2],
                result: p.result
            });
        }
        return updated;
    })();

    const r = {
        yes: { description: 'Goes together in one or more potions' },
        no: { description: 'Does not go together in any potion' },
        maybe: { description: 'No information available about this combination' }
    }
    const table = (() => {
        let table = new Array(ReagentCount);
        for (let i = 0; i < ReagentCount; i++) {
            table[i] = new Array(i).fill(r.maybe);
        }
        return table;
    })();

    let very: Set<Potion> = new Set();
    let promising: Set<Potion> = new Set();
    function get(x: Reagent, y: Reagent) {
        return x < y ? table[y][x] : table[x][y];
    }
    function set(x: Reagent, y: Reagent, val: typeof r.yes | typeof r.no | typeof r.maybe) {
        const current = x < y ? table[y][x] : table[x][y];
        if (current !== r.maybe && current !== val) {
            throw new Error('Recorded outcomes are inconsistent');
        }
        if (x < y) {
            table[y][x] = val;
        } else {
            table[x][y] = val;
        }
        return val;
    }

    function cellId(a: Reagent, b: Reagent): number {
        return a < b ? (a << 8) + b : (b << 8) + a;
    }

    for (const potion of potions) {
        switch(potion.result) {
            case PotionResult.COMPLETE: 
            case PotionResult.EXTRAORDINARY: 
                set(potion.first, potion.second, r.yes);
                set(potion.first, potion.third, r.yes);
                set(potion.second, potion.third, r.yes);
                break;
            case PotionResult.VERY:
                very.add(potion);
                break;
            case PotionResult.PROMISING:
                promising.add(potion);
                break;
            case PotionResult.USELESS:
                set(potion.first, potion.second, r.no);
                set(potion.first, potion.third, r.no);
                set(potion.second, potion.third, r.no);
                break;
            default:
                break;
        }
    }
    while (true) {
        let exitFinal: boolean = true;
        for (const p of very) {
            let exit = true;
            if (get(p.first, p.second) === r.no) {
                set(p.first, p.third, r.yes);
                set(p.second, p.third, r.yes);
                exit = false;
            } else if (get(p.second, p.third) === r.no) {
                set(p.first, p.third, r.yes);
                set(p.first, p.second, r.yes);
                exit = false;
            } else if (get(p.first, p.third) === r.no) {
                set(p.second, p.third, r.yes);
                set(p.first, p.second, r.yes);
                exit = false;
            } else if (get(p.first, p.second) === r.yes
                && get(p.first, p.third) === r.yes) {
                set(p.second, p.third, r.no);
                exit = false;
            } else if (get(p.first, p.second) === r.yes
                && get(p.second, p.third) === r.yes) {
                set(p.first, p.third, r.no);
                exit = false;
            } else if (get(p.first, p.third) === r.yes
                && get(p.second, p.third) === r.yes) {
                set(p.first, p.second, r.no);
                exit = false;
            }
            if (!exit) {
                very.delete(p);
                exitFinal = false;
            }
        }
        for (const p of promising) {
            let exit = true;
            if (get(p.first, p.second) === r.yes) {
                set(p.first, p.third, r.no);
                set(p.second, p.third, r.no);
                exit = false;
            } else if (get(p.second, p.third) === r.yes) {
                set(p.first, p.third, r.no);
                set(p.first, p.second, r.no);
                exit = false;
            } else if (get(p.first, p.third) === r.yes) {
                set(p.second, p.third, r.no);
                set(p.first, p.second, r.no);
                exit = false;
            } else if (get(p.first, p.second) === r.no
                && get(p.first, p.third) === r.no) {
                set(p.second, p.third, r.yes);
                exit = false;
            } else if (get(p.first, p.second) === r.no
                && get(p.second, p.third) === r.no) {
                set(p.first, p.third, r.yes);
                exit = false;
            } else if (get(p.first, p.third) === r.no
                && get(p.second, p.third) === r.no) {
                set(p.first, p.second, r.yes);
                exit = false;
            }
            if (!exit) {
                promising.delete(p);
                exitFinal = false;
            }
        }

        if (exitFinal) {
            break;
        }
    }

    const solver = new z.Solver();
    const TRUE = z.Bool.val(true);
    const FALSE = z.Bool.val(false);
    const variable = (cellID: number) => z.Bool.const(cellID.toString(16));
    let backbones: Set<number> = new Set();
    for (const p of very) {
        const v1 = get(p.first, p.second);
        const v2 = get(p.second, p.third);
        const v3 = get(p.first, p.third);
        const n1 = cellId(p.first, p.second);
        const n2 = cellId(p.second, p.third);
        const n3 = cellId(p.first, p.third);
        const [p1, p2, p3] = [
            v1 === r.yes ? TRUE : (v1 === r.no ? FALSE : variable(n1)),
            v2 === r.yes ? TRUE : (v2 === r.no ? FALSE : variable(n2)),
            v3 === r.yes ? TRUE : (v3 === r.no ? FALSE : variable(n3))
        ]
        if (v1 === r.maybe) { backbones.add(n1); }
        if (v2 === r.maybe) { backbones.add(n2); }
        if (v3 === r.maybe) { backbones.add(n3); }
        solver.add(z.Or(
            z.And(p1, p2, z.Not(p3)),
            z.And(p1, z.Not(p2), p3),
            z.And(z.Not(p1), p2, p3)
        ));
    }
    for (const p of promising) {
        const v1 = get(p.first, p.second);
        const v2 = get(p.second, p.third);
        const v3 = get(p.first, p.third);
        const n1 = cellId(p.first, p.second);
        const n2 = cellId(p.second, p.third);
        const n3 = cellId(p.first, p.third);
        const [p1, p2, p3] = [
            v1 === r.yes ? TRUE : (v1 === r.no ? FALSE : variable(n1)),
            v2 === r.yes ? TRUE : (v2 === r.no ? FALSE : variable(n2)),
            v3 === r.yes ? TRUE : (v3 === r.no ? FALSE : variable(n3))
        ]
        if (v1 === r.maybe) { backbones.add(n1); }
        if (v2 === r.maybe) { backbones.add(n2); }
        if (v3 === r.maybe) { backbones.add(n3); }
        solver.add(z.Or(
            z.And(p1, z.Not(p2), z.Not(p3)),
            z.And(z.Not(p1), z.Not(p2), p3),
            z.And(z.Not(p1), p2, z.Not(p3))
        ));
    }
    if (await solver.check() !== 'sat') {
        throw new Error('Unsolvable or Z3 solver error');
    }
    const principle = solver.model();
    const principleVars: Map<number, boolean> = new Map();
    for (const cellID of backbones) {
        principleVars.set(cellID, principle.eval(variable(cellID)).eqIdentity(TRUE));
    }
    const untested = new Set(backbones);
    while (untested.size > 0) {
        const targetID = untested.values().next().value!;
        untested.delete(targetID);
        const targetVar = variable(targetID);
        const targetIsTrue = principleVars.get(targetID)!;
        const res = await solver.check(z.Eq(targetVar, targetIsTrue ? FALSE : TRUE));
        if (res === 'sat') { 
            // Definitively not a backbone
            backbones.delete(targetID);
            const model = solver.model();
            for (const cellID of backbones) {
                if (model.eval(variable(cellID)).eqIdentity(TRUE) !== principleVars.get(cellID)) {
                    // Definitively not a backbone, differs
                    backbones.delete(cellID);
                    untested.delete(cellID);
                }
            }
        } else if (res === 'unsat') {
            // Definitively a backbone; it stays in `backbones` but has already
            // been removed from the worklist above.
        } else {
            throw new Error('Z3 solver error: unknown');
        }
    }
    for (const cellID of backbones) {
        const [x, y] = [cellID >>> 8, cellID & 0xFF];
        set(x, y, principleVars.get(cellID) ? r.yes : r.no);
    }

    // identify rectangles where vertices consists of pair = yes and one of the vertices land on a cell where y = x
    // those are minimum extraordinarily promising potions
    let options: Set<Potion> = new Set();
    for (let y = 0; y < ReagentCount; y++) {
        for (let x = 0; x < y; x++) {
            if (get(x, y) !== r.yes) {
                continue;
            }
            let yIndices: Set<number> = new Set();
            for (let ey = y - 1; ey > x; ey--) {
                if (get(x, ey) === r.yes) {
                    yIndices.add(ey);
                }
            }
            let xIndices: Set<number> = new Set();
            for (let ex = x + 1; ex < y; ex++) {
                if (get(ex, y) === r.yes) {
                    xIndices.add(ex);
                }
            }
            const final: Set<number> = new Set([...yIndices].filter(v => xIndices.has(v)));
            for (const f of final) {
                options.add({
                    first: x,
                    second: f,
                    third: y,
                    result: PotionResult.EXTRAORDINARY
                });
            }
        }
    }

    // identify rectangles where vertices consists of pair = maybe and one of the vertices land on a cell where y = x
    // checking those potions might give the maximum amount of information
    let optionsRecommendations: Set<Potion> = new Set();
    let count = 0;
    let coveredCells: Set<number> = new Set();
    const sorted = reagentsSortedFromEasyToHard;
    function conflict(r1: Reagent, r2: Reagent, r3: Reagent) {
        for (const p of potions) {
            // Collision check
            if (([p.first, p.second, p.third]).filter(v => [r1, r2, r3].includes(v)).length === 3) {
                return true;
            }
        }
        for (const p of optionsRecommendations) {
            // Collision check v2
            if (([p.first, p.second, p.third]).filter(v => [r1, r2, r3].includes(v)).length === 3) {
                return true;
            }
        }
        return false;
    }
    loop:
    for (const maybeCount of [3, 2, 1]) {
        for (const checkCoveredCells of [true, false]) {
            for (let y = 0; y < ReagentCount; y++) {
                for (let x = 0; x < y; x++) {
                    if (maybeCount >= 3 && get(sorted[x], sorted[y]) !== r.maybe) {
                        continue;
                    }
                    let yIndices: Set<number> = new Set();
                    for (let ey = x + 1; ey < y; ey++) {
                        if (get(sorted[x], sorted[ey]) === r.maybe) {
                            yIndices.add(sorted[ey]);
                        }
                    }
                    let xIndices: Set<number> = new Set();
                    for (let ex = x + 1; ex < y; ex++) {
                        if (get(sorted[ex], sorted[y]) === r.maybe) {
                            xIndices.add(sorted[ex]);
                        }
                    }
                    const base = cellId(sorted[x], sorted[y]);
                    const auxillaryMaybeCount = maybeCount - ((get(sorted[x], sorted[y]) === r.maybe) ? 1 : 0);
                    if (auxillaryMaybeCount === 0) {
                        // Fallback for finding pairs with 0 maybes
                        for (let id = 0; id < ReagentCount; id++) {
                            const f = sorted[id];
                            if (f === sorted[x] || f === sorted[y]) { continue; }
                            const left = cellId(sorted[x], f);
                            const right = cellId(f, sorted[y]);
                            if (yIndices.has(f) || xIndices.has(f) === false) {
                                if (conflict(sorted[x], f, sorted[y])) {
                                    continue;
                                }
                                if (checkCoveredCells && 
                                    (coveredCells.has(base) ? 1 : 0) + 
                                    (coveredCells.has(left) ? 1 : 0) + 
                                    (coveredCells.has(right) ? 1 : 0) > 0) {
                                    continue;
                                }
                                if (count >= recommendationsCount) {
                                    break loop;
                                }
                                optionsRecommendations.add({
                                    first: sorted[x],
                                    second: f,
                                    third: sorted[y],
                                    result: PotionResult.UNKNOWN
                                });
                                count++;
                                coveredCells.add(left);
                                coveredCells.add(right);
                                coveredCells.add(base);
                            }
                        }
                    }
                    if (auxillaryMaybeCount === 1) {
                        // Fallback for finding partials with 1 maybe
                        for (let id = 0; id < ReagentCount; id++) {
                            const f = sorted[id];
                            if (f === sorted[x] || f === sorted[y]) { continue; }
                            const left = cellId(sorted[x], f);
                            const right = cellId(f, sorted[y]);
                            if (yIndices.has(f) !== xIndices.has(f)) {
                                if (conflict(sorted[x], f, sorted[y])) {
                                    continue;
                                }
                                if (checkCoveredCells && 
                                    (coveredCells.has(base) ? 1 : 0) + 
                                    (coveredCells.has(left) ? 1 : 0) + 
                                    (coveredCells.has(right) ? 1 : 0) > 0) {
                                    continue;
                                }
                                if (count >= recommendationsCount) {
                                    break loop;
                                }
                                optionsRecommendations.add({
                                    first: sorted[x],
                                    second: f,
                                    third: sorted[y],
                                    result: PotionResult.UNKNOWN
                                });
                                count++;
                                coveredCells.add(left);
                                coveredCells.add(right);
                                coveredCells.add(base);
                            }
                        }
                    }
                    if (auxillaryMaybeCount === 2) {
                        const final: Set<number> = new Set([...yIndices].filter(v => xIndices.has(v)));
                        for (const f of final) {
                            const left = cellId(sorted[x], f);
                            const right = cellId(f, sorted[y]);
                            if (checkCoveredCells && 
                                (coveredCells.has(base) ? 1 : 0) + 
                                (coveredCells.has(left) ? 1 : 0) + 
                                (coveredCells.has(right) ? 1 : 0) > 0) {
                                continue;
                            }
                            if (count >= recommendationsCount) {
                                break loop;
                            }
                            if (conflict(sorted[x], f, sorted[y])) {
                                continue;
                            }
                            optionsRecommendations.add({
                                first: sorted[x],
                                second: f,
                                third: sorted[y],
                                result: PotionResult.UNKNOWN
                            });
                            count++;
                            coveredCells.add(left);
                            coveredCells.add(right);
                            coveredCells.add(base);
                        }
                    }
                }
            }
        }
    }
    return {
        extraordinary: options,
        recommendedForMaxInfo: optionsRecommendations,
        truthinessObjects: r as SolveResult['truthinessObjects'],
        pairingTable: table as SolveResult['pairingTable']
    };
}

export default solve;