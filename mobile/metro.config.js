const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can find shared packages and root node_modules
config.watchFolders = [repoRoot];

// Tell Metro to resolve packages from both mobile and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Enable package.json exports field resolution (needed for @ctrend/shared)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
