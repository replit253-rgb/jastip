async function test() {
  const r1 = await fetch("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "081200000000", password: "owner123" })
  });
  console.log("Owner login status:", r1.status, await r1.text());

  const r2 = await fetch("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "081200000001", password: "admin123" })
  });
  console.log("Admin login status:", r2.status, await r2.text());
}

test();
