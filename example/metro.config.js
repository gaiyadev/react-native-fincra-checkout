const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the root workspace directory so Metro can compile SDK source files
config.watchFolders = [workspaceRoot];

// 2. Force peer dependencies to resolve ONLY from example/node_modules
// so we never bundle duplicate React Native / React runtimes from root node_modules
const modulesToForceFromExample = [
  'react',
  'react-native',
  'react-native-webview',
  '@babel/runtime',
];

const exampleNodeModules = path.resolve(projectRoot, 'node_modules');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const matchedModule = modulesToForceFromExample.find(
    (mod) => moduleName === mod || moduleName.startsWith(`${mod}/`)
  );

  if (matchedModule) {
    return context.resolveRequest(
      context,
      path.resolve(exampleNodeModules, moduleName),
      platform
    );
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
