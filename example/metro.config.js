const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the root library directory so Metro can compile SDK files
config.watchFolders = [workspaceRoot];

// 2. Resolve all modules from example/node_modules first, then root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Prevent loading duplicate react / react-native runtimes from root node_modules
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
