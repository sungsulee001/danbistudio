import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSourcePath = path.join(rootDir, 'src', 'lib', 'editor', 'plugin-signature.ts');
const DEV_KEY_PATTERN = /\b(local|dev|development|test|fixture)\b/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MIN_RSA_MODULUS_BYTES = 256;

export function buildPluginSigningReadiness(options = {}) {
  const sourcePath = path.resolve(options.sourcePath ?? defaultSourcePath);
  const channel = options.channel ?? process.env.DANBI_RELEASE_CHANNEL ?? 'development';
  const now = options.now ? new Date(options.now) : new Date();
  const keys = readTrustedSigningKeys(sourcePath);
  const productionKeys = keys.filter((key) => isProductionEligibleSigningKey(key, now));
  const devOnlyKeys = keys.filter((key) => isDevelopmentSigningKey(key));
  const invalidProductionMaterialKeys = keys.filter((key) => (
    !isDevelopmentSigningKey(key) &&
    (key.status ?? 'active') !== 'revoked' &&
    !isSigningKeyMaterialReady(key)
  ));
  const warnings = [];

  if (keys.length === 0) {
    warnings.push('No trusted plugin manifest signing keys were found.');
  }
  if (productionKeys.length === 0) {
    warnings.push('No active production plugin manifest signing key is configured.');
  }
  if (devOnlyKeys.length > 0) {
    warnings.push(`${devOnlyKeys.length} development plugin signing key${devOnlyKeys.length === 1 ? '' : 's'} remain configured.`);
  }
  if (invalidProductionMaterialKeys.length > 0) {
    warnings.push(`${invalidProductionMaterialKeys.length} production plugin signing key${invalidProductionMaterialKeys.length === 1 ? '' : 's'} have invalid RSA public key material.`);
  }

  return {
    kind: 'danbi.plugin-signing.readiness',
    checkedAt: now.toISOString(),
    channel,
    sourcePath,
    productionReady: productionKeys.length > 0,
    trustedKeyCount: keys.length,
    productionKeyCount: productionKeys.length,
    developmentKeyCount: devOnlyKeys.length,
    keys: keys.map((key) => ({
      id: key.id,
      label: key.label,
      status: key.status,
      validFrom: key.validFrom,
      validUntil: key.validUntil,
      replacementKeyId: key.replacementKeyId,
      keyMaterialReady: isSigningKeyMaterialReady(key),
      productionEligible: productionKeys.some((productionKey) => productionKey.id === key.id),
      developmentOnly: isDevelopmentSigningKey(key),
    })),
    warnings,
  };
}

export function assertPluginSigningReadiness(summary, options = {}) {
  const requireProduction = Boolean(options.requireProduction) || summary.channel === 'production';
  if (!requireProduction || summary.productionReady) {
    return;
  }

  throw new Error(
    'Production plugin signing readiness failed: configure at least one active non-development trusted plugin signing key before production release.',
  );
}

function readTrustedSigningKeys(sourcePath) {
  const text = readFileSync(sourcePath, 'utf8');
  const declaration = text.match(/DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!declaration) {
    return [];
  }

  return [...declaration[1].matchAll(/\{\s*id:\s*'([^']+)'([\s\S]*?)\n\s*\}/g)].map((match) => {
    const body = match[2];
    return {
      id: match[1],
      label: readObjectString(body, 'label') ?? '',
      algorithm: readObjectString(body, 'algorithm') ?? '',
      modulusBase64Url: readObjectString(body, 'modulusBase64Url') ?? '',
      exponentBase64Url: readObjectString(body, 'exponentBase64Url') ?? '',
      status: readObjectString(body, 'status') ?? 'active',
      validFrom: readObjectString(body, 'validFrom'),
      validUntil: readObjectString(body, 'validUntil'),
      replacementKeyId: readObjectString(body, 'replacementKeyId'),
    };
  });
}

function readObjectString(body, key) {
  return body.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
}

function isProductionEligibleSigningKey(key, now) {
  if (isDevelopmentSigningKey(key) || key.status === 'revoked' || !isSigningKeyMaterialReady(key)) {
    return false;
  }
  if (key.validFrom && !Number.isFinite(Date.parse(key.validFrom))) {
    return false;
  }
  if (key.validUntil && !Number.isFinite(Date.parse(key.validUntil))) {
    return false;
  }
  if (key.validFrom && Date.parse(key.validFrom) > now.getTime()) {
    return false;
  }
  if (key.validUntil && Date.parse(key.validUntil) < now.getTime()) {
    return false;
  }
  return key.status === 'active' || key.status === 'retiring';
}

function isDevelopmentSigningKey(key) {
  return DEV_KEY_PATTERN.test(`${key.id} ${key.label}`);
}

function isSigningKeyMaterialReady(key) {
  if (key.algorithm !== 'rsa-sha256-pkcs1-v1_5') {
    return false;
  }

  const modulusBytes = decodeBase64UrlBytes(key.modulusBase64Url);
  const exponentBytes = decodeBase64UrlBytes(key.exponentBase64Url);
  if (modulusBytes.length < MIN_RSA_MODULUS_BYTES || exponentBytes.length === 0 || modulusBytes[0] === 0) {
    return false;
  }

  const exponent = BigInt(`0x${exponentBytes.toString('hex')}`);
  return exponent > 1n && (exponent & 1n) === 1n;
}

function decodeBase64UrlBytes(value) {
  if (typeof value !== 'string' || !value || !BASE64URL_PATTERN.test(value)) {
    return Buffer.alloc(0);
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(`${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`, 'base64');
  } catch {
    return Buffer.alloc(0);
  }
}

function parseCliArgs(argv) {
  const options = {
    sourcePath: defaultSourcePath,
    channel: process.env.DANBI_RELEASE_CHANNEL ?? 'development',
    requireProduction: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') {
      options.sourcePath = path.resolve(argv[++index] ?? '');
    } else if (arg === '--channel') {
      options.channel = argv[++index] ?? options.channel;
    } else if (arg === '--require-production') {
      options.requireProduction = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function formatHelp() {
  return [
    'Usage: node scripts/plugin-signing-readiness.mjs [--source <plugin-signature.ts>] [--channel <name>] [--require-production]',
    '',
    'Checks whether the release has at least one active non-development trusted plugin signing key.',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const summary = buildPluginSigningReadiness(options);
    assertPluginSigningReadiness(summary, options);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
