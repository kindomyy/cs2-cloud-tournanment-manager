import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

async function collect(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collect(path));
    else
      result[relative("dist", path).replaceAll("\\", "/")] =
        await readFile(path);
  }
  return result;
}

// Direct Upload expects index.html at the ZIP root, without a dist/ wrapper.
const archive = zipSync(await collect("dist"), { level: 6 });
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/kampus-arena-test.zip", archive);
console.log("Cloudflare Pages test paketi: artifacts/kampus-arena-test.zip");
