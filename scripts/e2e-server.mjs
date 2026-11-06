import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = process.env.HANSAN_E2E_RUNTIME_ROOT
  ? resolve(process.env.HANSAN_E2E_RUNTIME_ROOT)
  : mkdtempSync(join(tmpdir(), "hansan-e2e-"));
const isolatedProject = join(runtimeRoot, "app");
const databaseDirectory = join(runtimeRoot, "pglite");
const nodeModules = join(projectRoot, "node_modules");
const nextCli = join(nodeModules, "next", "dist", "bin", "next");
const tsxCli = join(nodeModules, "tsx", "dist", "cli.mjs");
const port = process.env.HANSAN_E2E_PORT ?? "43173";
let server;
let shuttingDown = false;

function copyProject() {
  mkdirSync(isolatedProject);
  cpSync(projectRoot, isolatedProject, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      if (!pathFromRoot) return true;
      const topLevel = pathFromRoot.split(sep)[0] ?? "";
      return (
        ![".data", ".next", "node_modules", ".git", "test-results", "playwright-report"].includes(
          topLevel,
        ) &&
        !topLevel.startsWith(".tmp-") &&
        !topLevel.startsWith(".env")
      );
    },
  });
  symlinkSync(nodeModules, join(isolatedProject, "node_modules"), "junction");
}

function run(command, args, env, timeout) {
  const result = spawnSync(command, args, {
    cwd: isolatedProject,
    env,
    stdio: "inherit",
    timeout,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function removeRuntime() {
  if (existsSync(runtimeRoot)) rmSync(runtimeRoot, { recursive: true, force: true });
}

async function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("close", resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 8_000)),
    ]);
  }
  removeRuntime();
}

async function main() {
  if (!existsSync(nodeModules) || !existsSync(nextCli) || !existsSync(tsxCli)) {
    throw new Error("Install project dependencies before running the browser E2E suite.");
  }

  copyProject();

  const buildEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HANSAN_DB_DRIVER: "pglite",
    HANSAN_PGLITE_DIR: databaseDirectory,
    HANSAN_AUTO_MIGRATE: "false",
    HANSAN_DEMO_MODE: "false",
  };

  run(process.execPath, [nextCli, "build", "--webpack"], buildEnv, 540_000);

  const seedEnv = {
    ...buildEnv,
    NODE_ENV: "development",
    HANSAN_AUTO_MIGRATE: "true",
    HANSAN_DEMO_MODE: "true",
  };
  run(process.execPath, [tsxCli, "scripts/seed.ts"], seedEnv, 120_000);

  server = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", port],
    {
      cwd: isolatedProject,
      env: buildEnv,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  server.once("error", (error) => {
    console.error("[e2e] unable to start the isolated app server", error);
    removeRuntime();
    process.exitCode = 1;
  });
  server.once("close", (code) => {
    removeRuntime();
    process.exitCode = code ?? 1;
  });
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
process.once("exit", removeRuntime);

main().catch(async (error) => {
  console.error("[e2e] isolated environment setup failed", error);
  await stop();
  process.exitCode = 1;
});
