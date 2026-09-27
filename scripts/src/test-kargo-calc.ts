import assert from "node:assert/strict";

// Test kargo calculation logic
const length = 34;
const width = 30;
const height = 21;
const divisor = 1000000;

const volumeWeight = Number(((length * width * height) / divisor).toFixed(6));
assert.equal(volumeWeight, 0.02142);

const rate = 1900000;
const totalShipping = Math.round(volumeWeight * rate);
assert.equal(totalShipping, 40698);

// Test second item: 66 × 64 × 13 with rate 1,900,000
const vw2 = Number(((66 * 64 * 13) / divisor).toFixed(6));
assert.equal(vw2, 0.054912);
const total2 = Math.round(vw2 * rate);
assert.equal(total2, 104333);

// Test third item: 200 × 90 × 26 with rate 1,500,000
const vw3 = Number(((200 * 90 * 26) / divisor).toFixed(6));
assert.equal(vw3, 0.468);
const total3 = Math.round(vw3 * 1500000);
assert.equal(total3, 702000);

console.log("✓ All Jastip Kargo calculation test cases PASS!");
console.log("  - Case 1 (Rak Sepatu): 34×30×21 cm = 0.02142 M³ × Rp 1.900.000 = Rp 40.698 (Bukan Rp 70.000)");
console.log("  - Case 2 (Kereta Bayi): 66×64×13 cm = 0.054912 M³ × Rp 1.900.000 = Rp 104.333");
console.log("  - Case 3 (Kasur): 200×90×26 cm = 0.468 M³ × Rp 1.500.000 = Rp 702.000");
