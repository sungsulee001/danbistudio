const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const projectDir = context.projectDir || context.packager?.projectDir || process.cwd();
  const source = path.join(projectDir, '.next', 'standalone', 'node_modules');
  const target = path.join(context.appOutDir, 'resources', 'renderer', 'standalone', 'node_modules');

  if (!existsSync(source)) {
    throw new Error(`Next standalone node_modules is missing: ${source}`);
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: true,
  });
};
