// Metro config: teach the bundler to resolve `@shared` → packages/shared and to
// watch that folder for changes, so the Expo app (Metro) can import the same
// cross-runtime code the Deno API uses. (NWE-110 cross-runtime import mechanism.)
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const sharedSrc = path.resolve(projectRoot, 'packages/shared/src');

// Watch the shared package so edits hot-reload in the app.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(projectRoot, 'packages/shared')];

// Resolve the `@shared` alias (and its subpaths) to the shared source.
const extraNodeModules = config.resolver.extraNodeModules ?? {};
config.resolver.extraNodeModules = {
  ...extraNodeModules,
  '@shared': sharedSrc,
};

// Allow importing `.ts`/`.tsx` files with explicit extensions (Deno needs the
// extensions too, so the shared barrel uses them — keep Metro in agreement).
config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, 'ts', 'tsx'])
);

// Keep test files OUT of the app bundle. Colocated `*.test.tsx` under app/ would
// otherwise be picked up (expo-router scans app/, Metro follows imports) and drag
// in @testing-library/react-native, which requires Node's `console` and blows up
// the RN bundle. jest still finds them via its own testMatch.
const testFilePatterns = [
  /.*\.test\.(ts|tsx|js|jsx)$/,
  /.*\/__tests__\/.*/,
  /.*\/jest\.setup\.js$/,
];
const existingBlockList = config.resolver.blockList;
const existingPatterns = Array.isArray(existingBlockList)
  ? existingBlockList
  : existingBlockList
    ? [existingBlockList]
    : [];
config.resolver.blockList = [...existingPatterns, ...testFilePatterns];

module.exports = config;
