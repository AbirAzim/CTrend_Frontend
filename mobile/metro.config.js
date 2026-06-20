const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const sharedSrc = path.resolve(repoRoot, "packages/shared/src");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can find shared packages and root node_modules
config.watchFolders = [repoRoot];

// Tell Metro to resolve packages from both mobile and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Block the @ctrend/shared symlinks from Metro's file map entirely.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  new RegExp(`${path.join(projectRoot, "node_modules/@ctrend").replace(/\\/g, "\\\\")}.*`),
  new RegExp(`${path.join(repoRoot, "node_modules/@ctrend").replace(/\\/g, "\\\\")}.*`),
];

// Resolve @ctrend/shared/* directly to the shared src tree.
const _resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@ctrend/shared/")) {
    const subpath = moduleName.slice("@ctrend/shared/".length);
    return context.resolveRequest(
      context,
      path.join(sharedSrc, subpath),
      platform,
    );
  }
  return _resolveRequest
    ? _resolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
