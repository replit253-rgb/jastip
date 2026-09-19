const API_BASE = "http://localhost:3000/api";

async function main() {
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "081200000001", password: "admin123" }),
  });
  const { token } = await loginRes.json();

  console.time("bulk");
  const res = await fetch(`${API_BASE}/packages/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      batchId: 1,
      packages: [
        {
          customerName: "Siti Aminah",
          resiNumber: `RESI-GRP1-${Date.now()}`,
          serviceType: "jastip hemat+",
          deliveryRoute: "Jakarta → Manokwari",
          realWeight: 0.8,
          length: 15,
          width: 10,
          height: 10,
        },
      ],
    }),
  });
  console.timeEnd("bulk");
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Data:", data);
}

main().catch(console.error);
