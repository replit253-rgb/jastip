import assert from "node:assert/strict";
import {
  applyShippingMinimum,
  distributeShippingTotal,
} from "../../artifacts/api-server/src/lib/shipping-minimum.ts";

const disabled = { enabled: false, minimumAmount: 10000 };
const hemat = { enabled: true, minimumAmount: 10000 };
const pelniJakarta = { enabled: true, minimumAmount: 20000 };
const pelniSurabaya = { enabled: true, minimumAmount: 18000 };
const kargo = { enabled: true, minimumAmount: 25000 };

// UAT-04 / Skenario 1: OFF preserves the normal amount.
assert.equal(applyShippingMinimum(4000, disabled), 4000);

// UAT-04 / Skenario 2: Hemat normal Rp2.000 becomes Rp10.000 when ON.
assert.equal(applyShippingMinimum(2000, hemat), 10000);

// UAT-04 / Skenario 3: Pelni Jakarta normal Rp10.000 becomes Rp20.000.
assert.equal(applyShippingMinimum(10000, pelniJakarta), 20000);

// UAT-04 / Skenario 4: Pelni Surabaya/Cargo floors apply to the aggregate,
// then the exact total is distributed across rows (never a floor per row).
assert.equal(applyShippingMinimum(9000, pelniSurabaya), 18000);
const cargoRows = distributeShippingTotal(
  applyShippingMinimum(15000, kargo),
  [5000, 10000],
);
assert.deepEqual(cargoRows, [8334, 16666]);
assert.equal(cargoRows.reduce((sum, amount) => sum + amount, 0), 25000);

console.log("UAT-04 shipping minimum scenarios: PASS (4 scenarios)");