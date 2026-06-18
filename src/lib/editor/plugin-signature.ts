import type { EditorPluginManifest } from './types';

export const PLUGIN_MANIFEST_SIGNATURE_ALGORITHM = 'manifest-sha256-v1';
export const PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM = 'manifest-rsa-sha256-v1';
export const PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PREFIX = 'manifest-v1-';
export const PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN = /^manifest-v1-[a-f0-9]{64}$/;
export const PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PREFIX = 'rsa-sha256-v1-';
export const PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN = /^rsa-sha256-v1-[A-Za-z0-9_-]+$/;

export type PluginManifestSignatureStatus =
  | 'unsigned'
  | 'verified'
  | 'mismatch'
  | 'unsupported'
  | 'invalid'
  | 'untrusted-key'
  | 'bad-signature';

export type PluginManifestSignatureTrustLevel = 'none' | 'fingerprint-only' | 'trusted-signer' | 'untrusted-signer';
export type PluginManifestSigningKeyLifecycleStatus = 'active' | 'retiring' | 'revoked';
export type PluginManifestSigningKeyVerificationStatus = PluginManifestSigningKeyLifecycleStatus | 'expired' | 'not-yet-valid' | 'invalid-policy';

export interface PluginManifestTrustedSigningKey {
  id: string;
  label: string;
  algorithm: 'rsa-sha256-pkcs1-v1_5';
  modulusBase64Url: string;
  exponentBase64Url: string;
  status?: PluginManifestSigningKeyLifecycleStatus;
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
  replacementKeyId?: string;
}

export interface PluginManifestSignatureVerification {
  status: PluginManifestSignatureStatus;
  trustLevel: PluginManifestSignatureTrustLevel;
  algorithm: string | null;
  keyId: string | null;
  signedAt: string | null;
  manifestFingerprint: string | null;
  computedFingerprint: string;
  signatureValue: string | null;
  signingKeyFingerprint: string | null;
  signingKeyLabel: string | null;
  signingKeyStatus?: PluginManifestSigningKeyVerificationStatus | null;
  signingKeyValidFrom?: string | null;
  signingKeyValidUntil?: string | null;
  signingKeyReplacementKeyId?: string | null;
  reason: string;
}

export const DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS: PluginManifestTrustedSigningKey[] = [
  {
    id: 'danbi-production-plugin-rsa-2026',
    label: 'Danbi Studio production plugin signing key',
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: 'usKHFzbo0695Q43nFGIgowgxcppSzg2yje6m7sqzgSchLFWKZKqIv_yrFdfFvZA9B_QvTH8_dlbyvzBgrElvanhtho_yTJwV_P0sFrj7d-ib4r5_bbzr_qreIvuI8FhqAhqXox8ca5yeHnxrrUdKkf_AvzmaDUs1JmXnCTeBwXUmn_oosXjPpVKWfOwPTT9bg3EnEDy5qN9OEsroCabw2bb3ojAdvzZhhnGBNQriniQHC7SByDcrJkmZ2EigZ5JsCQlcmxlywbUixMLXImI9OT70u2UcOBh5_cJWj4YBsBX__7ncGQVYwbmyAsSSBJXYOlphZfA28BZJjJb1K6XvMJKZCuTF4kKazSNkar_dfkNYCCKZmnEFaO78z2Jj6A9g70Xyeq7dWEQwsYqzPG0ti-SH1NGngG27XJS3CljBJKPG7mJQR2IDI_HfIfPegR04dYkI56oSIwfjHg80au9IMXigFNYE8ia6guMoZEM5yCMLRqAW64qLlZXn1-JtotZV',
    exponentBase64Url: 'AQAB',
    status: 'active',
    validFrom: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'danbi-local-plugin-dev-rsa-2026',
    label: 'Danbi Studio local plugin signing key',
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: 'yVptW0fsT-rUIO2Vpnszetl91chlZNvY-qZBeGI4zvdVsEOSLhamYR0J-hwPV6GiOK7qiweZRk5BOYja2aV_9eiPRtsSHGvK1xW3QISaBHMKbPYCMxiLGUp9cF_ru1_PbKvJ_hhf-gO1Nb2cGqAeU0R4n62N9k3riwK9E5GHsY9GdcHJKY7iDjKyEa-rmFgHWpWHfFP8-v2wMHzvSP6CU1LAbmAFquloLSeL-bXMluWq4Ty_i-99zWuE4u9MxZykcPBvmyQcWFRAfX8Xl2gVgP2Z7k3qIE3Vw4Qp5shg5IZfLPVHEFWD8iggrP8UbiGtLoy-gHQvmhh-2x_YLhDiVw',
    exponentBase64Url: 'AQAB',
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  },
];

const EXPORTER_WRITER_PROJECT_TRUST_FIELDS = new Set([
  'trust',
  'trustFingerprint',
  'trustedAt',
  'trustHistory',
]);

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function buildPluginManifestSignatureFingerprint(plugin: EditorPluginManifest | Record<string, unknown>): string {
  return `${PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PREFIX}${sha256Hex(buildPluginManifestSignaturePayload(plugin))}`;
}

export function buildPluginManifestSignaturePayload(plugin: EditorPluginManifest | Record<string, unknown>): string {
  return stableStringify(normalizePluginManifestForSignature(plugin, null)) ?? 'null';
}

export function buildPluginManifestSigningKeyFingerprint(key: PluginManifestTrustedSigningKey): string {
  const payload = stableStringify({
    algorithm: key.algorithm,
    exponentBase64Url: key.exponentBase64Url,
    id: key.id,
    modulusBase64Url: key.modulusBase64Url,
  }) ?? '';
  return `signer-v1-${sha256Hex(payload)}`;
}

export function verifyPluginManifestSignature(
  plugin: EditorPluginManifest | Record<string, unknown>,
  options: { trustedSigningKeys?: PluginManifestTrustedSigningKey[]; verificationTime?: string | Date } = {},
): PluginManifestSignatureVerification {
  const computedFingerprint = buildPluginManifestSignatureFingerprint(plugin);
  const payload = buildPluginManifestSignaturePayload(plugin);
  const signature = isRecord(plugin.signature) ? plugin.signature : null;
  const trustedSigningKeys = options.trustedSigningKeys ?? DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS;
  if (plugin.signature === undefined) {
    return {
      status: 'unsigned',
      trustLevel: 'none',
      algorithm: null,
      keyId: null,
      signedAt: null,
      manifestFingerprint: null,
      computedFingerprint,
      signatureValue: null,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: 'Plugin manifest has no signature fingerprint; external file imports remain disabled.',
    };
  }

  if (!signature) {
    return {
      status: 'invalid',
      trustLevel: 'none',
      algorithm: null,
      keyId: null,
      signedAt: null,
      manifestFingerprint: null,
      computedFingerprint,
      signatureValue: null,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: 'Plugin manifest signature must be an object.',
    };
  }

  const algorithm = readString(signature.algorithm);
  const keyId = readString(signature.keyId);
  const manifestFingerprint = readString(signature.manifestFingerprint);
  const signatureValue = readString(signature.signatureValue);
  const signedAt = readString(signature.signedAt) ?? null;
  if (algorithm !== PLUGIN_MANIFEST_SIGNATURE_ALGORITHM && algorithm !== PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM) {
    return {
      status: 'unsupported',
      trustLevel: 'none',
      algorithm,
      keyId,
      signedAt,
      manifestFingerprint,
      computedFingerprint,
      signatureValue,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: `Plugin manifest signature algorithm must be ${PLUGIN_MANIFEST_SIGNATURE_ALGORITHM}.`,
    };
  }

  if (!keyId || !manifestFingerprint || !PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN.test(manifestFingerprint)) {
    return {
      status: 'invalid',
      trustLevel: 'none',
      algorithm,
      keyId,
      signedAt,
      manifestFingerprint,
      computedFingerprint,
      signatureValue,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: 'Plugin manifest signature must include keyId and a manifest-v1 SHA-256 fingerprint.',
    };
  }

  if (manifestFingerprint !== computedFingerprint) {
    return {
      status: 'mismatch',
      trustLevel: 'none',
      algorithm,
      keyId,
      signedAt,
      manifestFingerprint,
      computedFingerprint,
      signatureValue,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: 'Plugin manifest signature fingerprint does not match the current manifest contents.',
    };
  }

  if (algorithm === PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM) {
    if (!signatureValue || !PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN.test(signatureValue)) {
      return {
        status: 'invalid',
        trustLevel: 'none',
        algorithm,
        keyId,
        signedAt,
        manifestFingerprint,
        computedFingerprint,
        signatureValue,
        signingKeyFingerprint: null,
        signingKeyLabel: null,
        reason: 'Plugin manifest RSA signature must include a rsa-sha256-v1 signatureValue.',
      };
    }

    const trustedKey = trustedSigningKeys.find((key) => key.id === keyId && key.algorithm === 'rsa-sha256-pkcs1-v1_5');
    if (!trustedKey) {
      return {
        status: 'untrusted-key',
        trustLevel: 'untrusted-signer',
        algorithm,
        keyId,
        signedAt,
        manifestFingerprint,
        computedFingerprint,
        signatureValue,
        signingKeyFingerprint: null,
        signingKeyLabel: null,
        reason: `Plugin manifest signer key "${keyId}" is not trusted by this Danbi Studio build.`,
      };
    }

    const verified = verifyRsaSha256Pkcs1v15({
      payload,
      signatureValue,
      key: trustedKey,
    });
    const signingKeyFingerprint = buildPluginManifestSigningKeyFingerprint(trustedKey);
    if (!verified) {
      return {
        status: 'bad-signature',
        trustLevel: 'untrusted-signer',
        algorithm,
        keyId,
        signedAt,
        manifestFingerprint,
        computedFingerprint,
        signatureValue,
        signingKeyFingerprint,
        signingKeyLabel: trustedKey.label,
        reason: 'Plugin manifest RSA signature does not verify against the trusted signer key.',
      };
    }

    const signingKeyPolicy = evaluatePluginSigningKeyPolicy(trustedKey, {
      signedAt,
      verificationTime: options.verificationTime,
    });
    if (!signingKeyPolicy.trusted) {
      return {
        status: 'untrusted-key',
        trustLevel: 'untrusted-signer',
        algorithm,
        keyId,
        signedAt,
        manifestFingerprint,
        computedFingerprint,
        signatureValue,
        signingKeyFingerprint,
        signingKeyLabel: trustedKey.label,
        signingKeyStatus: signingKeyPolicy.status,
        signingKeyValidFrom: signingKeyPolicy.validFrom,
        signingKeyValidUntil: signingKeyPolicy.validUntil,
        signingKeyReplacementKeyId: signingKeyPolicy.replacementKeyId,
        reason: signingKeyPolicy.reason,
      };
    }

    return {
      status: 'verified',
      trustLevel: 'trusted-signer',
      algorithm,
      keyId,
      signedAt,
      manifestFingerprint,
      computedFingerprint,
      signatureValue,
      signingKeyFingerprint,
      signingKeyLabel: trustedKey.label,
      signingKeyStatus: signingKeyPolicy.status,
      signingKeyValidFrom: signingKeyPolicy.validFrom,
      signingKeyValidUntil: signingKeyPolicy.validUntil,
      signingKeyReplacementKeyId: signingKeyPolicy.replacementKeyId,
      reason: signingKeyPolicy.status === 'retiring'
        ? signingKeyPolicy.reason
        : 'Plugin manifest RSA signature verifies against a trusted signer key.',
    };
  }

  if (signatureValue) {
    return {
      status: 'invalid',
      trustLevel: 'none',
      algorithm,
      keyId,
      signedAt,
      manifestFingerprint,
      computedFingerprint,
      signatureValue,
      signingKeyFingerprint: null,
      signingKeyLabel: null,
      reason: `Plugin manifest signatureValue requires ${PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM}.`,
    };
  }

  return {
    status: 'verified',
    trustLevel: 'fingerprint-only',
    algorithm,
    keyId,
    signedAt,
    manifestFingerprint,
    computedFingerprint,
    signatureValue: null,
    signingKeyFingerprint: null,
    signingKeyLabel: null,
    reason: 'Plugin manifest signature fingerprint matches the current manifest contents.',
  };
}

function evaluatePluginSigningKeyPolicy(
  key: PluginManifestTrustedSigningKey,
  options: { signedAt: string | null; verificationTime?: string | Date },
): {
  trusted: boolean;
  status: PluginManifestSigningKeyVerificationStatus;
  validFrom: string | null;
  validUntil: string | null;
  replacementKeyId: string | null;
  reason: string;
} {
  const lifecycleStatus = key.status ?? 'active';
  const validFrom = readString(key.validFrom);
  const validUntil = readString(key.validUntil);
  const replacementKeyId = readString(key.replacementKeyId);
  const effectiveTime = parsePolicyTime(options.signedAt) ?? parsePolicyTime(options.verificationTime) ?? Date.now();
  const validFromTime = validFrom ? parsePolicyTime(validFrom) : null;
  const validUntilTime = validUntil ? parsePolicyTime(validUntil) : null;

  if (!['active', 'retiring', 'revoked'].includes(lifecycleStatus)) {
    return {
      trusted: false,
      status: 'invalid-policy',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" has an invalid lifecycle policy.`,
    };
  }
  if (validFrom && validFromTime === null) {
    return {
      trusted: false,
      status: 'invalid-policy',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" has an invalid validFrom policy timestamp.`,
    };
  }
  if (validUntil && validUntilTime === null) {
    return {
      trusted: false,
      status: 'invalid-policy',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" has an invalid validUntil policy timestamp.`,
    };
  }
  if (lifecycleStatus === 'revoked') {
    const revokedAt = readString(key.revokedAt);
    const revokedText = revokedAt ? ` at ${revokedAt}` : '';
    const replacementText = replacementKeyId ? ` Use replacement key "${replacementKeyId}".` : '';
    return {
      trusted: false,
      status: 'revoked',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" was revoked${revokedText}.${replacementText}`,
    };
  }
  if (validFromTime !== null && effectiveTime < validFromTime) {
    return {
      trusted: false,
      status: 'not-yet-valid',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" is not valid before ${validFrom}.`,
    };
  }
  if (validUntilTime !== null && effectiveTime > validUntilTime) {
    const replacementText = replacementKeyId ? ` Use replacement key "${replacementKeyId}".` : '';
    return {
      trusted: false,
      status: 'expired',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest signer key "${key.id}" expired at ${validUntil}.${replacementText}`,
    };
  }
  if (lifecycleStatus === 'retiring') {
    const replacementText = replacementKeyId ? ` Replacement key: "${replacementKeyId}".` : '';
    return {
      trusted: true,
      status: 'retiring',
      validFrom,
      validUntil,
      replacementKeyId,
      reason: `Plugin manifest RSA signature verifies against a retiring trusted signer key.${replacementText}`,
    };
  }

  return {
    trusted: true,
    status: 'active',
    validFrom,
    validUntil,
    replacementKeyId,
    reason: 'Plugin manifest RSA signature verifies against an active trusted signer key.',
  };
}

function parsePolicyTime(value: string | Date | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizePluginManifestForSignature(value: unknown, parentKey: string | null): unknown {
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

function stableStringify(value: unknown): string | undefined {
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

function verifyRsaSha256Pkcs1v15({
  payload,
  signatureValue,
  key,
}: {
  payload: string;
  signatureValue: string;
  key: PluginManifestTrustedSigningKey;
}): boolean {
  const signatureBytes = decodeBase64Url(signatureValue.slice(PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PREFIX.length));
  const modulusBytes = decodeBase64Url(key.modulusBase64Url);
  const exponentBytes = decodeBase64Url(key.exponentBase64Url);
  if (signatureBytes.length === 0 || modulusBytes.length < 128 || exponentBytes.length === 0) {
    return false;
  }

  const modulus = bytesToBigInt(modulusBytes);
  const exponent = bytesToBigInt(exponentBytes);
  const signature = bytesToBigInt(signatureBytes);
  if (signature >= modulus) {
    return false;
  }

  const decoded = bigIntToBytes(modPow(signature, exponent, modulus), modulusBytes.length);
  if (!decoded || decoded.length !== modulusBytes.length) {
    return false;
  }

  const digestInfoPrefix = [
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
    0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
    0x00, 0x04, 0x20,
  ];
  const digestInfo = [...digestInfoPrefix, ...sha256BytesFromString(payload)];
  if (decoded[0] !== 0x00 || decoded[1] !== 0x01) {
    return false;
  }

  const separatorIndex = decoded.indexOf(0x00, 2);
  if (separatorIndex < 10) {
    return false;
  }
  for (let index = 2; index < separatorIndex; index += 1) {
    if (decoded[index] !== 0xff) {
      return false;
    }
  }

  const actualDigestInfo = decoded.slice(separatorIndex + 1);
  return byteArraysEqual(actualDigestInfo, digestInfo);
}

function sha256Hex(value: string): string {
  return bytesToHex(sha256BytesFromString(value));
}

function sha256BytesFromString(value: string): number[] {
  return sha256Bytes(Array.from(new TextEncoder().encode(value)));
}

function sha256Bytes(inputBytes: number[]): number[] {
  const bytes = [...inputBytes];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  const bitLengthHigh = Math.floor(bitLength / 0x100000000);
  const bitLengthLow = bitLength >>> 0;
  bytes.push(
    (bitLengthHigh >>> 24) & 0xff,
    (bitLengthHigh >>> 16) & 0xff,
    (bitLengthHigh >>> 8) & 0xff,
    bitLengthHigh & 0xff,
    (bitLengthLow >>> 24) & 0xff,
    (bitLengthLow >>> 16) & 0xff,
    (bitLengthLow >>> 8) & 0xff,
    bitLengthLow & 0xff,
  );

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const wordOffset = offset + index * 4;
      words[index] = (
        (bytes[wordOffset] << 24) |
        (bytes[wordOffset + 1] << 16) |
        (bytes[wordOffset + 2] << 8) |
        bytes[wordOffset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.flatMap((word) => [
    (word >>> 24) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 8) & 0xff,
    word & 0xff,
  ]);
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function decodeBase64Url(value: string): number[] {
  if (!value || /[^A-Za-z0-9_-]/.test(value)) {
    return [];
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const chunk = padded.slice(index, index + 4);
    const values = chunk.split('').map((char) => (char === '=' ? -1 : table.indexOf(char)));
    if (values.some((item) => item < -1)) {
      return [];
    }
    const bits = ((values[0] & 0x3f) << 18) |
      ((values[1] & 0x3f) << 12) |
      (((values[2] < 0 ? 0 : values[2]) & 0x3f) << 6) |
      ((values[3] < 0 ? 0 : values[3]) & 0x3f);
    output.push((bits >>> 16) & 0xff);
    if (values[2] >= 0) {
      output.push((bits >>> 8) & 0xff);
    }
    if (values[3] >= 0) {
      output.push(bits & 0xff);
    }
  }

  return output;
}

function bytesToBigInt(bytes: number[]): bigint {
  const hex = bytesToHex(bytes);
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function bigIntToBytes(value: bigint, length: number): number[] | null {
  const hex = value.toString(16).padStart(length * 2, '0');
  if (hex.length > length * 2) {
    return null;
  }

  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) {
    return 0n;
  }

  let result = 1n;
  let factor = base % modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = (result * factor) % modulus;
    }
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }
  return result;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function byteArraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
