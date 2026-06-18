import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirs = [
  'src/electron',
  'src/server/editor',
  'src/app/editor',
  'src/lib/editor',
];
const fileExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const builtinModuleNames = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  'fs/promises',
  'node:fs/promises',
]);
const clientRuntimeBannedModules = new Set([
  ...builtinModuleNames,
  'electron',
]);
const nativeEditorServiceFiles = new Set([
  'src/lib/editor/comfyui-queue.ts',
  'src/lib/editor/media-cache-queue.ts',
  'src/lib/editor/media-cache.ts',
  'src/lib/editor/render-queue.ts',
  'src/lib/editor/stt-queue.ts',
]);
const importPatterns = [
  /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const violations = [];
const files = sourceDirs.flatMap((dir) => collectFiles(path.join(rootDir, dir)));

for (const filePath of files) {
  checkFile(filePath);
}

if (violations.length > 0) {
  console.error('Electron architecture boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.message}`);
  }
  process.exit(1);
}

console.log(`Electron architecture boundary check passed (${files.length} files scanned).`);

function collectFiles(dirPath) {
  if (!statSync(dirPath, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  return readdirSync(dirPath)
    .flatMap((entry) => {
      const entryPath = path.join(dirPath, entry);
      const stats = statSync(entryPath);
      if (stats.isDirectory()) {
        return collectFiles(entryPath);
      }

      return fileExtensions.has(path.extname(entryPath)) ? [entryPath] : [];
    });
}

function checkFile(filePath) {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  const layer = readLayer(relativePath);
  const text = readFileSync(filePath, 'utf8');

  if (layer === 'renderer' || layer === 'app-editor' || layer === 'shared' || layer === 'editor-core') {
    checkClientRuntimeSurface(relativePath, layer, text);
  }

  for (const specifier of extractImportSpecifiers(text)) {
    checkImport(relativePath, layer, specifier);
  }
}

function checkClientRuntimeSurface(relativePath, layer, text) {
  if (layer === 'editor-core' && nativeEditorServiceFiles.has(relativePath)) {
    return;
  }

  if (/\brequire\(/.test(text)) {
    addViolation(relativePath, `${layer} code must not call require(); route native access through Electron main/preload IPC.`);
  }

  if (layer === 'renderer' || layer === 'app-editor') {
    const processAccess = text.match(/\bprocess\.(?!env\b)/g);
    if (processAccess) {
      addViolation(relativePath, `${layer} code must not access process directly outside build-time process.env.`);
    }
  }
}

function checkImport(relativePath, layer, specifier) {
  const target = resolveImportTarget(relativePath, specifier);
  const targetLayer = target ? readLayer(target) : readBareModuleLayer(specifier);

  if (targetLayer === 'node-or-electron') {
    if (layer === 'editor-core' && nativeEditorServiceFiles.has(relativePath) && specifier !== 'electron') {
      return;
    }

    if (isClientLayer(layer) || layer === 'editor-core') {
      addViolation(relativePath, `${layer} code imports native module "${specifier}". Use shared types plus IPC/client adapters instead.`);
    }
    return;
  }

  if (layer === 'main' && (targetLayer === 'preload' || targetLayer === 'renderer' || targetLayer === 'app-editor')) {
    addViolation(relativePath, `main code must not import ${targetLayer} code via "${specifier}".`);
  }

  if (layer === 'server-service' && (targetLayer === 'preload' || targetLayer === 'renderer' || targetLayer === 'app-editor')) {
    addViolation(relativePath, `server service code must not import ${targetLayer} code via "${specifier}".`);
  }

  if (layer === 'preload' && (targetLayer === 'main' || targetLayer === 'renderer' || targetLayer === 'app-editor')) {
    addViolation(relativePath, `preload code must only expose shared contracts and must not import ${targetLayer} code via "${specifier}".`);
  }

  if ((layer === 'renderer' || layer === 'app-editor') && (targetLayer === 'main' || targetLayer === 'preload')) {
    addViolation(relativePath, `${layer} code must not import ${targetLayer} code via "${specifier}".`);
  }

  if ((isClientLayer(layer) || layer === 'editor-core') && targetLayer === 'server-service') {
    if (layer === 'editor-core' && nativeEditorServiceFiles.has(relativePath)) {
      return;
    }

    addViolation(relativePath, `${layer} code must not import server service code via "${specifier}".`);
  }

  if (layer === 'shared' && (targetLayer === 'main' || targetLayer === 'preload' || targetLayer === 'renderer' || targetLayer === 'app-editor')) {
    addViolation(relativePath, `shared contracts must not import ${targetLayer} code via "${specifier}".`);
  }

  if (layer === 'editor-core' && (targetLayer === 'main' || targetLayer === 'preload' || targetLayer === 'renderer' || targetLayer === 'shared' || targetLayer === 'app-editor')) {
    addViolation(relativePath, `editor core must stay framework-neutral and must not import "${specifier}".`);
  }
}

function extractImportSpecifiers(text) {
  const specifiers = [];
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveImportTarget(relativePath, specifier) {
  if (specifier.startsWith('@/')) {
    return normalizePossibleSourcePath(`src/${specifier.slice(2)}`);
  }

  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const importerDir = path.posix.dirname(relativePath);
  return normalizePossibleSourcePath(path.posix.normalize(path.posix.join(importerDir, specifier)));
}

function normalizePossibleSourcePath(sourcePath) {
  const withoutIndex = sourcePath.endsWith('/index') ? sourcePath.slice(0, -'/index'.length) : sourcePath;
  const candidates = [
    withoutIndex,
    `${withoutIndex}.ts`,
    `${withoutIndex}.tsx`,
    `${withoutIndex}.js`,
    `${withoutIndex}.jsx`,
    `${withoutIndex}/index.ts`,
    `${withoutIndex}/index.tsx`,
  ];

  for (const candidate of candidates) {
    if (statSync(path.join(rootDir, candidate), { throwIfNoEntry: false })?.isFile()) {
      return toPosix(candidate);
    }
  }

  return toPosix(withoutIndex);
}

function readBareModuleLayer(specifier) {
  const rootModule = specifier.startsWith('node:')
    ? specifier
    : specifier.split('/')[0]?.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];

  return clientRuntimeBannedModules.has(specifier) || clientRuntimeBannedModules.has(rootModule)
    ? 'node-or-electron'
    : undefined;
}

function readLayer(relativePath) {
  if (relativePath.startsWith('src/electron/main/')) {
    return 'main';
  }
  if (relativePath.startsWith('src/electron/preload/')) {
    return 'preload';
  }
  if (relativePath.startsWith('src/electron/renderer/')) {
    return 'renderer';
  }
  if (relativePath.startsWith('src/electron/shared/')) {
    return 'shared';
  }
  if (relativePath.startsWith('src/server/editor/')) {
    return 'server-service';
  }
  if (relativePath.startsWith('src/app/editor/')) {
    return 'app-editor';
  }
  if (relativePath.startsWith('src/lib/editor/')) {
    return 'editor-core';
  }
  if (relativePath.startsWith('src/electron/')) {
    return 'electron-root';
  }

  return 'other';
}

function isClientLayer(layer) {
  return layer === 'renderer' || layer === 'app-editor' || layer === 'shared';
}

function addViolation(file, message) {
  violations.push({ file, message });
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
