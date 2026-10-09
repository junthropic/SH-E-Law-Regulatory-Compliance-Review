import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve("."),
  directory = mkdtempSync(resolve("work/v6-validation-"));
for (const name of [
  "server",
  "shared",
  "src",
  "scripts",
  "tests",
  "data",
  "public",
  "docs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.server.json",
  "vite.config.ts",
  "vitest.config.ts",
  "index.html",
  "AGENTS.md",
]) {
  if (existsSync(join(root, name)))
    cpSync(join(root, name), join(directory, name), { recursive: true });
}
symlinkSync(
  join(root, "node_modules"),
  join(directory, "node_modules"),
  "junction",
);
mkdirSync(join(directory, "work", "test-temp"), { recursive: true });
const npm = join(
  dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
if (!existsSync(npm)) throw Error("npm CLI path unavailable");
const env = {
  ...process.env,
  TEMP: join(directory, "work", "test-temp"),
  TMP: join(directory, "work", "test-temp"),
  SHE_DATA_DIR: join(directory, "work", "isolated-data"),
  SHE_TEST_BUILD: join(directory, "build"),
};
delete env.LAW_OC;
const steps = [];
for (const name of [
  "check",
  "test:e2e",
  "test:e2e:intake",
  "test:e2e:additional",
  "test:e2e:verification",
  "test:e2e:dossier",
  "test:e2e:public",
  "test:e2e:v3",
  "test:e2e:v4",
  "test:e2e:v5",
  "test:e2e:v6",
]) {
  const start = Date.now(),
    r = spawnSync(
      process.execPath,
      ["test:e2e:v3","test:e2e:v4","test:e2e:v5","test:e2e:v6"].includes(name)
        ? ["scripts/e2e-"+name.split(":").at(-1)+".mjs"]
        : name === "check"
          ? [
              npm,
              "run",
              name,
              "--",
              "--",
              "--reporter=default",
              "--reporter=json",
              "--outputFile=work/final-tests.json",
            ]
          : [npm, "run", name],
      {
        cwd: directory,
        env,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: 20_000_000,
        timeout:600000,
      },
    );
  const log = resolve(
    "work/v6-audit",
    basename(directory) + "-" + name.replaceAll(":", "-") + ".log",
  );
  writeFileSync(log, (r.stdout || "") + (r.stderr || ""));
  if (name === "check" && existsSync(join(directory, "work/final-tests.json")))
    cpSync(
      join(directory, "work/final-tests.json"),
      resolve("work/v6-audit/final-tests.json"),
    );
  steps.push({
    command:
      ["test:e2e:v3","test:e2e:v4","test:e2e:v5","test:e2e:v6"].includes(name)
        ? "node scripts/e2e-"+name.split(":").at(-1)+".mjs"
        : name === "check"
          ? "npm run check -- -- --reporter=default --reporter=json --outputFile=work/final-tests.json"
          : "npm run " + name,
    code: r.status,
    elapsedMs: Date.now() - start,
    log,
  });
  writeFileSync(
    resolve("work/v6-audit/isolated-validation.json"),
    JSON.stringify(
      {
        directory,
        at: new Date().toISOString(),
        productionTouched: false,
        steps,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve("work/v6-audit", basename(directory) + ".json"),
    JSON.stringify(
      {
        directory,
        at: new Date().toISOString(),
        productionTouched: false,
        steps,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(steps.at(-1)));
  if (r.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
