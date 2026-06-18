import { createHash, createSign } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST_FILE_NAME = 'danbi-plugin-package.json';
const PLUGIN_PACKAGE_KIND = 'danbi.plugin-package';
const PLUGIN_PACKAGE_VERSION = 1;
const SIGNATURE_FINGERPRINT_PREFIX = 'manifest-v1-';
const SIGNATURE_ALGORITHM = 'manifest-rsa-sha256-v1';
const SIGNATURE_VALUE_PREFIX = 'rsa-sha256-v1-';
const SAFE_PACKAGE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const EXPORTER_WRITER_PROJECT_TRUST_FIELDS = new Set([
  'trust',
  'trustFingerprint',
  'trustedAt',
  'trustHistory',
]);

function parseCliArgs(argv) {
  const options = {
    manifestPath: path.resolve(process.cwd(), DEFAULT_MANIFEST_FILE_NAME),
    privateKeyPath: process.env.DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH,
    keyId: process.env.DANBI_PLUGIN_SIGNING_KEY_ID,
    signedAt: new Date().toISOString(),
    outPath: undefined,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = path.resolve(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--package-dir') {
      options.manifestPath = path.resolve(readRequiredValue(argv, ++index, arg), DEFAULT_MANIFEST_FILE_NAME);
    } else if (arg === '--private-key') {
      options.privateKeyPath = path.resolve(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--key-id') {
      options.keyId = readRequiredValue(argv, ++index, arg).trim();
    } else if (arg === '--signed-at') {
      options.signedAt = readRequiredValue(argv, ++index, arg).trim();
    } else if (arg === '--out') {
      options.outPath = path.resolve(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readRequiredValue(argv, index, option) {
  const value = argv[index];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function formatHelp() {
  return [
    'Usage: node scripts/plugin-package-sign.mjs --manifest <danbi-plugin-package.json> --private-key <key.pem> --key-id <id> [--signed-at <iso>] [--out <path>] [--dry-run]',
    '',
    'Signs a Danbi plugin package manifest with RSA-SHA256 and refreshes package file bytes/SHA-256 metadata.',
    'The private key must not live inside the package folder or tracked source/release directories.',
  ].join('\n');
}

function assertValidOptions(options) {
  if (!options.keyId || options.keyId.includes('\0')) {
    throw new Error('--key-id or DANBI_PLUGIN_SIGNING_KEY_ID is required.');
  }
  if (!options.privateKeyPath) {
    throw new Error('--private-key or DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH is required.');
  }
  if (!Number.isFinite(Date.parse(options.signedAt))) {
    throw new Error('--signed-at must be a valid ISO timestamp.');
  }
}

function signPluginPackageManifest(options) {
  assertValidOptions(options);

  const manifestPath = path.resolve(options.manifestPath);
  const packageDirectory = path.dirname(manifestPath);
  const privateKeyPath = path.resolve(options.privateKeyPath);
  const targetPath = options.outPath ? path.resolve(options.outPath) : manifestPath;
  assertPathInsideDirectory(manifestPath, packageDirectory, 'Plugin package manifest');
  assertPrivateKeyCustody(privateKeyPath, packageDirectory);
  if (options.outPath) {
    assertPathInsideDirectory(targetPath, packageDirectory, 'Signed plugin package manifest output');
  }

  const privateKey = readFileSync(privateKeyPath, 'utf8');
  if (!privateKey.includes('PRIVATE KEY')) {
    throw new Error('Plugin signing private key must be a PEM private key.');
  }

  const manifest = readPluginPackageManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), manifestPath);
  const refreshedManifest = refreshPluginPackageFiles(manifest, packageDirectory);
  const unsignedPlugin = {
    ...refreshedManifest.plugin,
    signature: undefined,
  };
  delete unsignedPlugin.signature;
  const payload = buildPluginManifestSignaturePayload(unsignedPlugin);
  const manifestFingerprint = `${SIGNATURE_FINGERPRINT_PREFIX}${sha256Hex(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(payload);
  signer.end();
  const signatureValue = `${SIGNATURE_VALUE_PREFIX}${signer.sign(privateKey).toString('base64url')}`;
  const signedManifest = {
    ...refreshedManifest,
    plugin: {
      ...unsignedPlugin,
      signature: {
        algorithm: SIGNATURE_ALGORITHM,
        keyId: options.keyId,
        manifestFingerprint,
        signatureValue,
        signedAt: options.signedAt,
      },
    },
  };
  const serialized = `${JSON.stringify(signedManifest, null, 2)}\n`;

  if (!options.dryRun) {
    writeFileSync(targetPath, serialized, 'utf8');
  }

  return {
    kind: 'danbi.plugin-package.sign-result',
    status: options.dryRun ? 'dry-run' : 'signed',
    manifestPath,
    outputPath: targetPath,
    packageDirectory,
    pluginId: signedManifest.plugin.id,
    pluginVersion: signedManifest.plugin.version,
    keyId: options.keyId,
    signedAt: options.signedAt,
    manifestFingerprint,
    fileCount: signedManifest.files.length,
    files: signedManifest.files.map((file) => ({
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
    })),
    warnings: [
      'Private key material was read from disk but was not written into the plugin package manifest.',
      options.dryRun ? 'Dry run did not write the signed manifest.' : 'Signed manifest was written with refreshed package file metadata.',
    ],
  };
}

function readPluginPackageManifest(value, manifestPath) {
  if (!isRecord(value)) {
    throw new Error(`Plugin package manifest must be a JSON object: ${manifestPath}`);
  }
  if (value.kind !== PLUGIN_PACKAGE_KIND) {
    throw new Error(`Plugin package manifest kind must be ${PLUGIN_PACKAGE_KIND}.`);
  }
  if (value.packageVersion !== PLUGIN_PACKAGE_VERSION) {
    throw new Error(`Plugin package manifest packageVersion must be ${PLUGIN_PACKAGE_VERSION}.`);
  }
  if (!isRecord(value.plugin)) {
    throw new Error('Plugin package manifest plugin must be an object.');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('Plugin package manifest files must be a non-empty array.');
  }

  return {
    ...value,
    plugin: value.plugin,
    files: value.files.map((file, index) => readPluginPackageManifestFile(file, `files[${index}]`)),
  };
}

function readPluginPackageManifestFile(value, label) {
  if (!isRecord(value)) {
    throw new Error(`Plugin package manifest ${label} must be an object.`);
  }
  return {
    ...value,
    path: readSafePackageInstallPath(value.path, `Plugin package manifest ${label}.path`),
  };
}

function refreshPluginPackageFiles(manifest, packageDirectory) {
  const seenPaths = new Set();
  const files = manifest.files.map((file) => {
    if (seenPaths.has(file.path)) {
      throw new Error(`Plugin package file path "${file.path}" is duplicated.`);
    }
    seenPaths.add(file.path);
    const filePath = path.resolve(packageDirectory, ...file.path.split('/'));
    assertPathInsideDirectory(filePath, packageDirectory, 'Plugin package source file');
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`Plugin package source is not a regular file: ${file.path}`);
    }
    return {
      ...file,
      bytes: fileStat.size,
      sha256: `sha256-${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`,
    };
  });

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const pluginEntry = normalizeSafePackageInstallPath(manifest.plugin.entry);
  if (!pluginEntry || !filesByPath.has(pluginEntry)) {
    throw new Error(`Plugin package must include the plugin entry file ${manifest.plugin.entry}.`);
  }

  const plugin = refreshRuntimePackageFileMetadata(manifest.plugin, filesByPath);
  return {
    ...manifest,
    plugin,
    files,
  };
}

function refreshRuntimePackageFileMetadata(plugin, filesByPath) {
  if (!Array.isArray(plugin.exporterWriters)) {
    return plugin;
  }

  return {
    ...plugin,
    exporterWriters: plugin.exporterWriters.map((writer) => {
      if (!isRecord(writer) || !isRecord(writer.runtimePackage)) {
        return writer;
      }

      const root = normalizeSafePackageInstallPath(writer.runtimePackage.root);
      const entry = normalizeSafePackageRelativePath(writer.runtimePackage.entry);
      if (!root || !entry || !filesByPath.has(`${root}/${entry}`)) {
        throw new Error(`Plugin package must include exporter writer runtime entry ${writer.runtimePackage.root}/${writer.runtimePackage.entry}.`);
      }
      if (!Array.isArray(writer.runtimePackage.files) || writer.runtimePackage.files.length === 0) {
        throw new Error(`Plugin exporter writer runtimePackage ${writer.runtimePackage.packageId ?? ''} must list at least one file.`);
      }

      return {
        ...writer,
        runtimePackage: {
          ...writer.runtimePackage,
          files: writer.runtimePackage.files.map((runtimeFile) => {
            if (!isRecord(runtimeFile)) {
              throw new Error('Plugin exporter writer runtimePackage file must be an object.');
            }
            const runtimeFilePath = normalizeSafePackageRelativePath(runtimeFile.path);
            const packageFile = runtimeFilePath ? filesByPath.get(`${root}/${runtimeFilePath}`) : undefined;
            if (!runtimeFilePath || !packageFile) {
              throw new Error(`Plugin package must include exporter writer runtime file ${writer.runtimePackage.root}/${runtimeFile.path}.`);
            }
            return {
              ...runtimeFile,
              path: runtimeFilePath,
              bytes: packageFile.bytes,
              sha256: packageFile.sha256,
            };
          }),
        },
      };
    }),
  };
}

function buildPluginManifestSignaturePayload(plugin) {
  return stableStringify(normalizePluginManifestForSignature(plugin, null)) ?? 'null';
}

function normalizePluginManifestForSignature(value, parentKey) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePluginManifestForSignature(item, parentKey));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .flatMap((key) => {
        if (key === 'signature') {
          return [];
        }
        if (parentKey === 'exporterWriters' && EXPORTER_WRITER_PROJECT_TRUST_FIELDS.has(key)) {
          return [];
        }
        const normalized = normalizePluginManifestForSignature(value[key], key);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
  );
}

function stableStringify(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item) ?? 'null').join(',')}]`;
  }
  if (isRecord(value)) {
    const body = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const serialized = stableStringify(value[key]);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      })
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(null);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readSafePackageInstallPath(value, label) {
  const normalized = normalizeSafePackageInstallPath(value);
  if (!normalized) {
    throw new Error(`${label} must be a safe relative path under plugins/ or tools/.`);
  }
  return normalized;
}

function normalizeSafePackageInstallPath(value) {
  const normalized = normalizeSafePackageRelativePath(value);
  if (!normalized || (!normalized.startsWith('plugins/') && !normalized.startsWith('tools/'))) {
    return undefined;
  }
  return normalized;
}

function normalizeSafePackageRelativePath(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  return isSafeRelativePath(normalized) ? normalized : undefined;
}

function isSafeRelativePath(value) {
  return Boolean(value) &&
    !value.includes('\0') &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.startsWith('/') &&
    !value.startsWith('//') &&
    !/^[a-zA-Z]:\//.test(value) &&
    !value.split('/').includes('..') &&
    value.split('/').every((segment) => Boolean(segment) && segment !== '.' && SAFE_PACKAGE_PATH_SEGMENT.test(segment));
}

function assertPrivateKeyCustody(privateKeyPath, packageDirectory) {
  if (isPathInsideDirectory(privateKeyPath, packageDirectory)) {
    throw new Error('Plugin signing private key must not be stored inside the plugin package directory.');
  }

  const relativeToRepo = path.relative(rootDir, privateKeyPath).replace(/\\/g, '/');
  if (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo)) {
    const allowed = relativeToRepo.startsWith('.danbi/plugin-signing/');
    if (!allowed) {
      throw new Error('Plugin signing private key inside the repository must stay under .danbi/plugin-signing/.');
    }
  }
}

function assertPathInsideDirectory(targetPath, directory, label) {
  if (!isPathInsideDirectory(targetPath, directory)) {
    throw new Error(`${label} escapes directory: ${targetPath}`);
  }
}

function isPathInsideDirectory(targetPath, directory) {
  const relativePath = path.relative(path.resolve(directory), path.resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const result = signPluginPackageManifest(options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  buildPluginManifestSignaturePayload,
  signPluginPackageManifest,
};
