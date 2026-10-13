// v8 stage 3: type-check and build the beta screens into dist-beta/, then record a digest of their sources.
// package.json is frozen, so this runs directly: node scripts/build-beta-v8.mjs
// tests/v8-beta-build.test.ts checks that the committed dist-beta/ was built from the current sources.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { build } from "vite";
import { betaSourceDigest } from "./beta-digest-v8.mjs";

execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.beta.json"], { stdio: "inherit", windowsHide: true });
await build({ configFile: "vite.beta.config.ts", logLevel: "warn" });
const digest = betaSourceDigest();
writeFileSync("dist-beta/build-info.json", JSON.stringify(digest, null, 2) + "\n");
console.log(JSON.stringify({ built: "dist-beta", sources: digest.files.length, sourceDigest: digest.sourceDigest }));
