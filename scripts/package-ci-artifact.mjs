import { createHash } from "node:crypto";
import {
  cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

const root = process.cwd();
const output = resolve(root, "ci-artifact");
if (relative(root, output).startsWith(`..${sep}`) || relative(root, output) === ".." || output === root) {
  throw new Error("Artifact output must be a child of the repository root.");
}

const outputStat = await lstat(output).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (outputStat?.isSymbolicLink()) throw new Error("Refusing to replace a symlink at ci-artifact.");
if (outputStat && !outputStat.isDirectory()) throw new Error("Expected ci-artifact to be a directory.");

const sourceDist = resolve(root, "dist");
const requiredFiles = [
  "dist/server/wrangler.json",
  "dist/server/index.js",
  ".openai/hosting.json",
];
for (const path of requiredFiles) {
  await readFile(resolve(root, path)).catch((error) => {
    throw new Error(`Build artifact input is missing or unreadable: ${path}`, { cause: error });
  });
}
const clientEntries = await readdir(resolve(sourceDist, "client")).catch((error) => {
  throw new Error("Build artifact input is missing or unreadable: dist/client", { cause: error });
});
if (clientEntries.length === 0) throw new Error("Build artifact input is empty: dist/client");

const migrations = await readdir(resolve(root, "drizzle"), { withFileTypes: true }).catch((error) => {
  throw new Error("Drizzle migrations are missing or unreadable.", { cause: error });
});
if (!migrations.some((entry) => entry.isFile() && entry.name.endsWith(".sql"))) {
  throw new Error("No SQL migration found under drizzle/.");
}

const sha = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Expected a full 40-character commit SHA.");
if (!process.env.GITHUB_SHA) {
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" });
  if (status.trim()) throw new Error("Refusing to label a build from a dirty worktree with HEAD's commit SHA.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(tmpdir(), "auckland-kind-table-sites-build-"));
try {
  const stagedDist = resolve(stage, "dist");
  await cp(sourceDist, stagedDist, { recursive: true });

  const sourceManifest = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
  const builtManifestPath = resolve(stagedDist, ".openai/hosting.json");
  let builtManifest = {};
  try {
    builtManifest = JSON.parse(await readFile(builtManifestPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (sourceManifest.artifact_metadata != null && builtManifest.artifact_metadata != null &&
      !isDeepStrictEqual(sourceManifest.artifact_metadata, builtManifest.artifact_metadata)) {
    throw new Error("Conflicting artifact metadata in source and built hosting manifests.");
  }
  const artifactMetadata = builtManifest.artifact_metadata ?? sourceManifest.artifact_metadata;
  const stagedManifest = { ...sourceManifest };
  if (artifactMetadata != null) stagedManifest.artifact_metadata = artifactMetadata;
  await mkdir(resolve(stagedDist, ".openai"), { recursive: true });
  await writeFile(builtManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);

  const stagedMigrations = resolve(stagedDist, ".openai/drizzle");
  await rm(stagedMigrations, { recursive: true, force: true });
  await cp(resolve(root, "drizzle"), stagedMigrations, { recursive: true });

  const archiveName = `sites-build-${sha}.tar.gz`;
  const archivePath = resolve(output, archiveName);
  execFileSync("tar", [
    "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner",
    "-C", stage, "-czf", archivePath, "dist",
  ], { stdio: "inherit" });

  const members = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const requireMember = (path) => {
    if (!members.includes(path)) throw new Error(`Native Sites archive is missing ${path}.`);
  };
  for (const path of [
    "dist/server/wrangler.json",
    "dist/server/index.js",
    "dist/.openai/hosting.json",
  ]) requireMember(path);
  if (!members.some((path) => path.startsWith("dist/client/"))) {
    throw new Error("Native Sites archive has no dist/client assets.");
  }
  if (!members.some((path) => path.startsWith("dist/.openai/drizzle/") && path.endsWith(".sql"))) {
    throw new Error("Native Sites archive has no Drizzle SQL migrations.");
  }

  const archiveBytes = await readFile(archivePath);
  const checksum = createHash("sha256").update(archiveBytes).digest("hex");
  const checksumName = `${archiveName}.sha256`;
  await writeFile(resolve(output, `${archiveName}.commit`), `${sha}\n`);
  await writeFile(resolve(output, checksumName), `${checksum}  ${basename(archivePath)}\n`);

  const actualChecksum = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  if (actualChecksum !== checksum) throw new Error("Sites archive checksum verification failed.");
  console.log(`Prepared and verified ${archiveName} for ${sha} (${members.length} entries).`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
