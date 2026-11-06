import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = mkdtempSync(join(tmpdir(), "hansan-e2e-"));
const playwrightCli = join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const demoPassword =
  process.env.HANSAN_DEMO_PASSWORD ?? `e2e-${randomBytes(24).toString("base64url")}`;
let exitCode = 1;

try {
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        HANSAN_E2E_RUNTIME_ROOT: runtimeRoot,
        HANSAN_DEMO_PASSWORD: demoPassword,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} catch (error) {
  console.error("[e2e] Playwright runner failed", error);
} finally {
  rmSync(runtimeRoot, { recursive: true, force: true });
}

process.exitCode = exitCode;
