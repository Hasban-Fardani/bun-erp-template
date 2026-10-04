const url = process.argv[2];
if (!url) throw new Error("A readiness URL is required");
for (let attempt = 0; attempt < 60; attempt++) {
  const response = await fetch(url).catch(() => null); // no-log: startup polling expects connection refusal.
  if (response?.ok) process.exit(0);
  await Bun.sleep(500);
}
throw new Error(`Server did not become ready: ${url}`);
