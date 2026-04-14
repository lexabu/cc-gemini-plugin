#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLUGIN_NAME = "cc-gemini-plugin";
const USER_PLUGIN_PATH = path.join(".codex", "plugins", PLUGIN_NAME);
const USER_MARKETPLACE_PATH = path.join(".agents", "plugins", "marketplace.json");
const USAGE = `Usage:
  node scripts/install-codex-global.js

Copies the Codex plugin into ~/.codex/plugins/cc-gemini-plugin and ensures
~/.agents/plugins/marketplace.json contains the user-level marketplace entry.
`;

function parseCliArgs(argv) {
  if (argv.length === 0) {
    return { help: false };
  }

  if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
    return { help: true };
  }

  throw new Error(`Unsupported arguments: ${argv.join(" ")}\n\n${USAGE}`);
}

async function readJson(filePath) {
  try {
    const source = await fs.readFile(filePath, "utf8");
    return JSON.parse(source);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw new Error(`Failed to read JSON at ${filePath}: ${error.message}`);
  }
}

function createMarketplace() {
  return {
    name: "personal-plugins",
    interface: {
      displayName: "Personal Plugins",
    },
    plugins: [],
  };
}

function buildPluginEntry() {
  return {
    name: PLUGIN_NAME,
    source: {
      source: "local",
      path: `./${USER_PLUGIN_PATH}`,
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };
}

function ensureMarketplaceShape(marketplace, marketplacePath) {
  if (!marketplace || typeof marketplace !== "object" || Array.isArray(marketplace)) {
    throw new Error(`Expected ${marketplacePath} to contain a JSON object.`);
  }

  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`Expected ${marketplacePath} to contain a plugins array.`);
  }

  if (!marketplace.name) {
    marketplace.name = "personal-plugins";
  }

  if (!marketplace.interface || typeof marketplace.interface !== "object") {
    marketplace.interface = { displayName: "Personal Plugins" };
  } else if (!marketplace.interface.displayName) {
    marketplace.interface.displayName = "Personal Plugins";
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyPluginBundle(sourceDir, targetDir) {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });

  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    return;
  }

  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });
}

function resolveSourceDir(repoRoot, targetDir) {
  if (path.resolve(repoRoot) === path.resolve(targetDir)) {
    return repoRoot;
  }

  return path.join(repoRoot, "plugins", PLUGIN_NAME);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, USER_PLUGIN_PATH);
  const marketplacePath = path.join(homeDir, USER_MARKETPLACE_PATH);
  const sourceDir = resolveSourceDir(repoRoot, targetDir);
  const manifestPath = path.join(sourceDir, ".codex-plugin", "plugin.json");
  const manifest = await readJson(manifestPath);

  if (!manifest) {
    throw new Error(`Missing Codex manifest at ${manifestPath}.`);
  }

  await copyPluginBundle(sourceDir, targetDir);

  const marketplace = (await readJson(marketplacePath)) ?? createMarketplace();
  ensureMarketplaceShape(marketplace, marketplacePath);

  const pluginEntry = buildPluginEntry();
  const entryIndex = marketplace.plugins.findIndex((entry) => entry?.name === PLUGIN_NAME);
  if (entryIndex === -1) {
    marketplace.plugins.push(pluginEntry);
  } else {
    marketplace.plugins[entryIndex] = pluginEntry;
  }

  await writeJson(marketplacePath, marketplace);

  console.log(`Installed ${PLUGIN_NAME} ${manifest.version} for Codex.`);
  console.log(`Plugin path: ${targetDir}`);
  console.log(`Marketplace: ${marketplacePath}`);
  console.log("Restart Codex so the plugin directory reloads.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
