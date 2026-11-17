# Potion class solver

This is for the **Potion class** minigame in the [Just Natural Expansion Mod](https://github.com/dfsw/Just-Natural-Expansion), unlocked by leveling Alchemy labs to level 1 with a sugar lump.

This app aims to automate the process of discovering potions by analyzing the results of combinations to arrive at especially promising combinations, and can recommend new reagent combinations to test. This app supports the use of the Fever nightmare mode (randomized recipes), as it does not assume any predetermined recipes.

## How does this work?
In the Potion class minigame, when you mix three reagents together that do not have a potion, you get a **mixture**. There are four types of mixtures:
- Useless mixture: No pair of reagents in this mixture are used in a potion recipe.
- Promising mixture: Exactly one pair of reagents in this mixture are used in a potion recipe.
- Very promising mixture: Exactly two pairs of reagents in this mixture are used in a potion recipe.
- Extraordinary mixture: All pairs of reagents in this mixture are used in a potion recipe.

The app builds a table of all possible pairs of two different reagents and populates them with either "no possible potion", "involved in a potion", or "unknown". It first populates tiles represented by useless and extraordinary mixtures, then invokes the Z3 solver. The Z3 solver can efficiently compute solutions to the Boolean Satisfiability Problem. The remaining mixtures are translated into boolean expressions involving cells in the table, and solved by the Z3 solver, getting all cells that have a constant value in all possible solutions to the set of equations dictated by the set of mixtures. 

The table is used to compute combinations of 3 reagents whose 3 possible pairings are all "involved in a potion", which are at least extraordinary mixtures and is likely to be an actual potion. 

## Running

```sh
npm install
npm run dev         # http://localhost:3000
npm run build       # production build in dist/
npm run test:solver # solver regression tests (real Z3 + brute-force oracle)
```