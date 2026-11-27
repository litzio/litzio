// Gracefully stops a manual Host through its own /daemon/stop contract (identity + confirm).
// Usage: node stop-host.mjs <origin>
const origin = process.argv[2];
const headers = { "X-Litzio-Protocol": "4", Connection: "close" };
const identity = await (await fetch(`${origin}/daemon/health`, { headers })).json();
const response = await fetch(`${origin}/daemon/stop`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ ...identity, confirm: true }) });
console.log(response.status, JSON.stringify(await response.json()).slice(0, 120));
