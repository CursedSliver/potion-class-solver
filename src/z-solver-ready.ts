import { init } from 'z3-solver';
import type { Context } from 'z3-solver';

/** The single Z3 context the solver builds all of its expressions in. */
export type Z3Context = Context<'main'>;

let shared: Promise<Z3Context> | null = null;

/**
 * Initializes the Z3 WASM module and creates the solver context. Initialization
 * is expensive and a context is not meant to be re-created for every solve, so
 * the in-flight/ready promise is cached and shared. A failed initialization is
 * evicted so a later attempt can retry.
 */
export function begin(): Promise<Z3Context> {
    if (shared === null) {
        shared = init()
            .then(({ Context }) => new Context('main'))
            .catch((error: unknown) => {
                shared = null;
                throw error;
            });
    }
    return shared;
}
