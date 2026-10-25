// Numeric check of the engine: expected harm with no plan, the hazard-first plan,
// and the cascade-aware (Domino) plan, across storm sizes. Prints a markdown table.
import { MUMBAI } from "../src/lib/sim/mumbai";
import { emptyAllocation, hazardFirst, optimise, simulate } from "../src/lib/sim/engine";

const budget = { rescue: 8, generator: 3, purifier: 2 };
const k = (x: number) => Math.round(x).toLocaleString("en-IN");
console.log("| Rain (24 h) | High tide | No action | Hazard-first | Domino | Secondary-disaster harm (none → hazard-first → Domino) | Time |");
console.log("|---|---|---|---|---|---|---|");
for (const rainfall of [150, 250, 300, 400, 944]) {
  for (const highTide of [false, true]) {
    const scenario = { rainfall, highTide };
    const t0 = performance.now();
    const none = simulate(MUMBAI, scenario, emptyAllocation());
    const naive = simulate(MUMBAI, scenario, hazardFirst(MUMBAI, none, budget));
    const plan = optimise(MUMBAI, scenario, budget);
    const smart = simulate(MUMBAI, scenario, plan.alloc);
    const ms = Math.round(performance.now() - t0);
    const cut = (x: number) => `−${Math.round((1 - x / none.totalHarm) * 100)}%`;
    console.log(
      `| ${rainfall} mm | ${highTide ? "yes" : "no"} | ${k(none.totalHarm)} | ${k(naive.totalHarm)} (${cut(naive.totalHarm)}) | ${k(smart.totalHarm)} (${cut(smart.totalHarm)}) | ${k(none.cascadeHarm)} → ${k(naive.cascadeHarm)} → ${k(smart.cascadeHarm)} | ${ms} ms |`,
    );
  }
}
