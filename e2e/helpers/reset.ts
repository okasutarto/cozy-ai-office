export async function resetTestServer(baseURL: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${baseURL}/__test/reset`, { method: "POST" });
    if (response.ok) return response.json();
    const error = `${response.status} ${await response.text()}`;
    if (attempt === 19) throw new Error(`E2E reset failed: ${error}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("E2E reset failed");
}
