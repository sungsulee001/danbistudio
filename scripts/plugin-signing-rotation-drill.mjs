import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPluginSigningReadiness,
  buildPluginSigningReadiness,
} from './plugin-signing-readiness.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(rootDir, '.danbi', 'plugin-signing-rotation-drill');
const DEFAULT_NOW = '2026-06-16T00:00:00.000Z';
const SAFE_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/i;

function parseCliArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    currentKeyId: 'danbi-production-plugin-rsa-drill-current',
    nextKeyId: 'danbi-production-plugin-rsa-drill-next',
    now: DEFAULT_NOW,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') {
      options.outDir = path.resolve(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--current-key-id') {
      options.currentKeyId = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--next-key-id') {
      options.nextKeyId = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--now') {
      options.now = readRequiredValue(argv, ++index, arg);
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
    'Usage: node scripts/plugin-signing-rotation-drill.mjs [--out-dir <dir>] [--current-key-id <id>] [--next-key-id <id>] [--now <iso>]',
    '',
    'Runs an offline production plugin signer rotation drill using generated in-memory RSA keys.',
    'The drill writes public trusted-key fixture sources and a JSON report, but does not write private keys.',
  ].join('\n');
}

function assertValidOptions(options) {
  if (!SAFE_KEY_ID_PATTERN.test(options.currentKeyId)) {
    throw new Error('Current plugin signing key id must be 8-128 safe characters.');
  }
  if (!SAFE_KEY_ID_PATTERN.test(options.nextKeyId)) {
    throw new Error('Next plugin signing key id must be 8-128 safe characters.');
  }
  if (options.currentKeyId === options.nextKeyId) {
    throw new Error('Current and next plugin signing key ids must differ.');
  }
  if (!Number.isFinite(Date.parse(options.now))) {
    throw new Error('--now must be a valid ISO timestamp.');
  }
}

function generateTrustedKeyBase({ id, label, validFrom }) {
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicExponent: 0x10001,
  });
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error(`Generated RSA key for ${id} did not expose public JWK material.`);
  }

  return {
    id,
    label,
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: jwk.n,
    exponentBase64Url: jwk.e,
    validFrom,
  };
}

function buildScenarioSources(options) {
  const currentKey = generateTrustedKeyBase({
    id: options.currentKeyId,
    label: 'Danbi Studio production plugin signing key drill current',
    validFrom: '2026-01-01T00:00:00.000Z',
  });
  const nextKey = generateTrustedKeyBase({
    id: options.nextKeyId,
    label: 'Danbi Studio production plugin signing key drill next',
    validFrom: '2026-06-01T00:00:00.000Z',
  });

  return [
    {
      name: 'retiring-current-with-active-next',
      expectReady: true,
      keys: [
        {
          ...currentKey,
          status: 'retiring',
          validUntil: '2027-01-01T00:00:00.000Z',
          replacementKeyId: options.nextKeyId,
        },
        {
          ...nextKey,
          status: 'active',
        },
      ],
    },
    {
      name: 'revoked-current-with-active-next',
      expectReady: true,
      keys: [
        {
          ...currentKey,
          status: 'revoked',
          revokedAt: '2026-06-16T00:00:00.000Z',
          replacementKeyId: options.nextKeyId,
        },
        {
          ...nextKey,
          status: 'active',
        },
      ],
    },
    {
      name: 'expired-current-without-next',
      expectReady: false,
      keys: [
        {
          ...currentKey,
          status: 'active',
          validUntil: '2026-06-15T00:00:00.000Z',
        },
      ],
    },
  ];
}

function formatTrustedKeySource(keys) {
  return [
    'export const DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS = [',
    ...keys.flatMap((key) => formatTrustedKey(key)),
    '];',
    '',
  ].join('\n');
}

function formatTrustedKey(key) {
  const lines = [
    '  {',
    `    id: '${escapeSingleQuoted(key.id)}',`,
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
  if (key.revokedAt) {
    lines.push(`    revokedAt: '${key.revokedAt}',`);
  }
  if (key.replacementKeyId) {
    lines.push(`    replacementKeyId: '${escapeSingleQuoted(key.replacementKeyId)}',`);
  }
  lines.push('  },');
  return lines;
}

function escapeSingleQuoted(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function runScenario(options, scenario) {
  const sourcePath = path.join(options.outDir, `${scenario.name}.plugin-signature.ts`);
  writeFileSync(sourcePath, formatTrustedKeySource(scenario.keys), 'utf8');

  const readiness = buildPluginSigningReadiness({
    sourcePath,
    channel: 'production',
    now: options.now,
  });
  let status = 'passed';
  let error = null;

  try {
    assertPluginSigningReadiness(readiness, { requireProduction: true });
    if (!scenario.expectReady) {
      throw new Error('Scenario was expected to fail production readiness but passed.');
    }
  } catch (scenarioError) {
    if (scenario.expectReady) {
      status = 'failed';
      error = scenarioError instanceof Error ? scenarioError.message : String(scenarioError);
    }
  }

  if (!scenario.expectReady && readiness.productionReady) {
    status = 'failed';
    error = 'Scenario was expected to have productionReady=false.';
  }

  return {
    name: scenario.name,
    status,
    expectedProductionReady: scenario.expectReady,
    sourcePath: toRelative(sourcePath),
    readiness: {
      productionReady: readiness.productionReady,
      productionKeyCount: readiness.productionKeyCount,
      developmentKeyCount: readiness.developmentKeyCount,
      keys: readiness.keys.map((key) => ({
        id: key.id,
        status: key.status,
        replacementKeyId: key.replacementKeyId,
        keyMaterialReady: key.keyMaterialReady,
        productionEligible: key.productionEligible,
      })),
      warnings: readiness.warnings,
    },
    ...(error ? { error } : {}),
  };
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(formatHelp());
    return;
  }

  assertValidOptions(options);
  mkdirSync(options.outDir, { recursive: true });

  const scenarios = buildScenarioSources(options).map((scenario) => runScenario(options, scenario));
  const failedScenarios = scenarios.filter((scenario) => scenario.status !== 'passed');
  const reportPath = path.join(options.outDir, 'rotation-drill-report.json');
  const report = {
    kind: 'danbi.plugin-signing.rotation-drill',
    checkedAt: new Date().toISOString(),
    now: options.now,
    status: failedScenarios.length === 0 ? 'passed' : 'failed',
    outDir: toRelative(options.outDir),
    reportPath: toRelative(reportPath),
    scenarios,
    warnings: [
      'Rotation drill uses generated in-memory RSA keys and writes only public trusted-key fixtures.',
      'No private key material is written or printed by this drill.',
    ],
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (failedScenarios.length > 0) {
    throw new Error(`Plugin signing rotation drill failed: ${failedScenarios.map((scenario) => scenario.name).join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
