import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Ensure isolated in-memory test store so we never mutate a live database
process.env.DATABASE_URL = "";
delete process.env.PGHOST;

const { default: apiApp } = await import("../../artifacts/api-server/src/app");
const { db } = await import("../../lib/db/src/index");

assert.equal(Boolean((db as any)._isMock), true, "Expected Mock DB for isolated API test run");

const server = http.createServer(apiApp);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

async function api(path: string, opts: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

try {
  // 1. Login Owner & Admin
  const ownerLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "081200000000", password: "owner123" }),
  });
  assert.equal(ownerLogin.status, 200, `Owner login failed: ${JSON.stringify(ownerLogin.body)}`);
  const ownerToken = ownerLogin.body.token;
  assert.equal(ownerLogin.body.user.role, "owner");

  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "081200000001", password: "admin123" }),
  });
  assert.equal(adminLogin.status, 200, `Admin login failed: ${JSON.stringify(adminLogin.body)}`);
  const adminToken = adminLogin.body.token;
  assert.equal(adminLogin.body.user.role, "admin");

  // 2. Check GET /api/shifts/current includes policy
  const cur0 = await api("/api/shifts/current", { token: ownerToken });
  assert.equal(cur0.status, 200);
  assert.equal(cur0.body.shift, null);
  assert.equal(cur0.body.policy.tolerance, 0);
  assert.equal(cur0.body.policy.ownerBypass, true);
  assert.equal(cur0.body.policy.adminAllowWithReason, false);

  // 3. Owner opens shift with Rp 100.000
  const openOwner = await api("/api/shifts/open", {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({ shiftType: "PAGI", terminalId: "KASIR-OWNER", openingBalance: 100000 }),
  });
  assert.equal(openOwner.status, 201);
  const ownerShiftId = openOwner.body.shift.id;

  // 4. Owner begins blind closing
  const beginOwner = await api(`/api/shifts/${ownerShiftId}/close`, {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({}),
  });
  assert.equal(beginOwner.status, 200);
  assert.equal(beginOwner.body.status, "WAITING_ACTUAL_CASH");
  const ownerClosingId = beginOwner.body.closingId;
  assert.ok(ownerClosingId > 0);

  // 5. Owner closes with variance (-50,000) > tolerance (0) WITHOUT reason -> MUST SUCCEED
  const closeOwner = await api(`/api/shifts/${ownerShiftId}/close`, {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({ closingId: ownerClosingId, actualCash: 50000, alasanSelisih: "" }),
  });
  assert.equal(closeOwner.status, 200, `Owner close failed: ${JSON.stringify(closeOwner.body)}`);
  assert.equal(closeOwner.body.result, "KURANG");
  assert.equal(closeOwner.body.closing.selisih, -50000);
  assert.equal(closeOwner.body.closing.alasanSelisih, "Disetujui Owner (penyesuaian kas otomatis)");

  // 6. Verify /api/shifts/history requires auth and returns enriched closed shift
  const unauthHist = await api("/api/shifts/history");
  assert.equal(unauthHist.status, 401);

  const ownerHist = await api("/api/shifts/history", { token: ownerToken });
  assert.equal(ownerHist.status, 200);
  assert.equal(ownerHist.body.length, 1);
  assert.equal(ownerHist.body[0].id, ownerShiftId);
  assert.equal(ownerHist.body[0].adminName, "Owner JAJ");
  assert.equal(ownerHist.body[0].selisih, -50000);

  // 7. Verify /api/shifts/:id/summary returns summary
  const summaryRes = await api(`/api/shifts/${ownerShiftId}/summary`, { token: ownerToken });
  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.body.systemCash, 100000);

  // 8. Admin shift variance enforcement & settings control
  const openAdmin = await api("/api/shifts/open", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ shiftType: "MALAM", terminalId: "KASIR-01", openingBalance: 100000 }),
  });
  assert.equal(openAdmin.status, 201);
  const adminShiftId = openAdmin.body.shift.id;

  const beginAdmin = await api(`/api/shifts/${adminShiftId}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({}),
  });
  const adminClosingId = beginAdmin.body.closingId;

  // Admin without reason when variance = -5,000 (> 0) -> 400
  const adminFailNoReason = await api(`/api/shifts/${adminShiftId}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ closingId: adminClosingId, actualCash: 95000, alasanSelisih: "" }),
  });
  assert.equal(adminFailNoReason.status, 400);
  assert.equal(adminFailNoReason.body.code, "CASH_VARIANCE_REASON_REQUIRED");

  // Admin with reason when adminAllowWithReason=false -> 403 OWNER_APPROVAL_REQUIRED
  const adminFailApproval = await api(`/api/shifts/${adminShiftId}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ closingId: adminClosingId, actualCash: 95000, alasanSelisih: "Uang receh" }),
  });
  assert.equal(adminFailApproval.status, 403);
  assert.equal(adminFailApproval.body.code, "OWNER_APPROVAL_REQUIRED");

  // Admin cannot PATCH /api/settings (403)
  const adminPatchSettings = await api("/api/settings", {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({ cash_variance_tolerance: 10000 }),
  });
  assert.equal(adminPatchSettings.status, 403);

  // 9. Owner configures tolerance = 10000 via /api/settings
  const ownerPatchSettings = await api("/api/settings", {
    method: "PATCH",
    token: ownerToken,
    body: JSON.stringify({
      cash_variance_tolerance: 10000,
      cash_variance_owner_bypass: true,
      cash_variance_admin_allow_with_reason: false,
      _alasan: "Uji toleransi 10rb",
    }),
  });
  assert.equal(ownerPatchSettings.status, 200);
  assert.equal(ownerPatchSettings.body.cash_variance_tolerance, 10000);

  // 10. Now Admin closing with selisih -5,000 (<= 10,000 tolerance) succeeds!
  const adminSuccessWithinTol = await api(`/api/shifts/${adminShiftId}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ closingId: adminClosingId, actualCash: 95000, alasanSelisih: "" }),
  });
  assert.equal(adminSuccessWithinTol.status, 200, `Admin within tolerance failed: ${JSON.stringify(adminSuccessWithinTol.body)}`);
  assert.equal(adminSuccessWithinTol.body.result, "KURANG");
  assert.equal(adminSuccessWithinTol.body.tolerance, 10000);

  // 11. Test adminAllowWithReason = true when variance exceeds tolerance
  await api("/api/settings", {
    method: "PATCH",
    token: ownerToken,
    body: JSON.stringify({ cash_variance_admin_allow_with_reason: true }),
  });
  const openAdmin2 = await api("/api/shifts/open", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ shiftType: "PAGI", openingBalance: 100000 }),
  });
  const beginAdmin2 = await api(`/api/shifts/${openAdmin2.body.shift.id}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({}),
  });
  const adminSuccessWithReason = await api(`/api/shifts/${openAdmin2.body.shift.id}/close`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      closingId: beginAdmin2.body.closingId,
      actualCash: 50000,
      alasanSelisih: "Kasir setor ke bank",
    }),
  });
  assert.equal(adminSuccessWithReason.status, 200);
  assert.equal(adminSuccessWithReason.body.closing.alasanSelisih, "Kasir setor ke bank");

  // 12. Test barcode service-card summary & delete endpoint (Owner vs Admin)
  const adminImports = await api("/api/packages/imports?batchId=1", { token: adminToken });
  assert.equal(adminImports.status, 403);

  const ownerImports = await api("/api/packages/imports?batchId=1", { token: ownerToken });
  assert.equal(ownerImports.status, 200);
  assert.ok(Array.isArray(ownerImports.body.serviceCards));
  const kargoCard = ownerImports.body.serviceCards.find((c: any) => c.serviceKey === "jastip kargo");
  assert.ok(kargoCard, "Expected jastip kargo card in batch 1");

  const adminDeleteCard = await api("/api/packages/batch/1/service-card", {
    method: "DELETE",
    token: adminToken,
    body: JSON.stringify({ serviceKey: "jastip kargo", includeLegacy: true, includeManual: true }),
  });
  assert.equal(adminDeleteCard.status, 403);

  const ownerDeleteCard = await api("/api/packages/batch/1/service-card", {
    method: "DELETE",
    token: ownerToken,
    body: JSON.stringify({ serviceKey: "jastip kargo", includeLegacy: true, includeManual: true }),
  });
  assert.equal(ownerDeleteCard.status, 200);
  assert.equal(ownerDeleteCard.body.success, true);
  assert.ok(ownerDeleteCard.body.deletedCount >= 1);

  console.log("ALL SHIFT CLOSING, TOLERANCE SETTINGS & CARD DELETE API TESTS PASSED!");
} finally {
  server.close();
}
