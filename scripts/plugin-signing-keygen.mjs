import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(rootDir, '.danbi', 'plugin-signing');
const SAFE_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/i;

function parseCliArgs(argv) {
  const options = {
    keyId: `danbi-production-plugin-rsa-${new Date().getUTCFullYear()}`,
    label: 'Danbi Studio production plugin signing key',
    outDir: DEFAULT_OUT_DIR,
    status: 'active',
    validFrom: new Date().toISOString(),
    validUntil: undefined,
    replacementKeyId: undefined,
    force: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--key-id') {
      options.keyId = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--label') {
      options.label = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--out-dir') {
      options.outDir = path.resolve(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--status') {
      options.status = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--valid-from') {
      options.validFrom = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--valid-until') {
      options.validUntil = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--replacement-key-id') {
      options.replacementKeyId = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--force') {
      options.force = true;
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
    'Usage: node scripts/plugin-signing-keygen.mjs [--key-id <id>] [--label <label>] [--out-dir <dir>] [--valid-from <iso>] [--valid-until <iso>] [--force]',
    '',
    'Generates an RSA key pair for Danbi plugin manifest signing.',
    'Private key files are written under .danbi/plugin-signing by default, which is ignored by git.',
  ].join('\n');
}

function assertValidOptions(options) {
  if (!SAFE_KEY_ID_PATTERN.test(options.keyId)) {
    throw new Error('Plugin signing key id must be 8-128 safe characters.');
  }
  if (!options.label.trim()) {
    throw new Error('Plugin signing key label is required.');
  }
  if (!['active', 'retiring', 'revoked'].includes(options.status)) {
    throw new Error('Plugin signing key status must be active, retiring, or revoked.');
  }
  assertValidIsoTime(options.validFrom, '--valid-from');
  if (options.validUntil) {
    assertValidIsoTime(options.validUntil, '--valid-until');
  }
}

function assertValidIsoTime(value, label) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
}

function buildTrustedKey(options, publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('Generated RSA public key did not expose modulus/exponent JWK fields.');
  }

  return {
    id: options.keyId,
    label: options.label.trim(),
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: jwk.n,
    exponentBase64Url: jwk.e,
    status: options.status,
    validFrom: options.validFrom,
    ...(options.validUntil ? { validUntil: options.validUntil } : {}),
    ...(options.replacementKeyId ? { replacementKeyId: options.replacementKeyId } : {}),
  };
}

function formatTypeScriptTrustedKey(key) {
  const lines = [
    '  {',
    `    id: '${key.id}',`,
    `    label: '${escapeSingleQuoted(key.label)}',`,
    `    algorithm: '${key.algorithm}',`,
    `    modulusBase64Url: '${key.modulusBase64Url}',`,
    `    exponentBase64Url: '${key.exponentBase64Url}',`,
    `    status: '${key.status}',`,
    `    validFrom: '${key.validFrom}',`,
  ];
  if (key.validUntil) {
    lines.push(`    validUntil: '${key.validUntil}',`);
  }
  if (key.replacementKeyId) {
    lines.push(`    replacementKeyId: '${key.replacementKeyId}',`);
  }
  lines.push('  },');
  return lines.join('\n');
}

function escapeSingleQuoted(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function writeKeyFile(filePath, content, force) {
  if (!force && existsSync(filePath)) {
    throw new Error(`Refusing to overwrite existing key file without --force: ${filePath}`);
  }
  writeFileSync(filePath, content, 'utf8');
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(formatHelp());
    return;
  }

  assertValidOptions(options);
  mkdirSync(options.outDir, { recursive: true });

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicExponent: 0x10001,
  });
  const trustedKey = buildTrustedKey(options, publicKey);
  const basePath = path.join(options.outDir, options.keyId);
  const privateKeyPath = `${basePath}.private.pem`;
  const publicKeyPath = `${basePath}.public.pem`;
  const trustedKeyPath = `${basePath}.trusted-key.json`;

  writeKeyFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), options.force);
  writeKeyFile(publicKeyPath, publicKey.export({ format: 'pem', type: 'spki' }), options.force);
  writeKeyFile(trustedKeyPath, `${JSON.stringify(trustedKey, null, 2)}\n`, options.force);

  console.log(JSON.stringify({
    kind: 'danbi.plugin-signing.keygen',
    keyId: trustedKey.id,
    label: trustedKey.label,
    privateKeyPath,
    publicKeyPath,
    trustedKeyPath,
    trustedKey,
    typeScriptTrustedKey: formatTypeScriptTrustedKey(trustedKey),
    warnings: [
      'Keep the private key out of git and release artifacts.',
      'Commit only the public trusted key material after reviewing the generated TypeScript snippet.',
    ],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
