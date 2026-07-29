// The internal-context signing secret, resolved once at boot by createApp() and
// reused for credential-fingerprint derivation. Keeping it in a module-scoped
// holder (rather than a DI provider) mirrors how the interceptor already
// receives it and avoids threading it through every controller constructor.
//
// Fail-closed: reading it before createApp() has installed it throws rather than
// silently deriving fingerprints under an empty key.

let internalContextSecret: Buffer | undefined;

export function setInternalContextSecret(secret: Buffer): void {
  if (secret.byteLength < 32) {
    throw new Error('Internal context secret must be at least 32 bytes');
  }
  internalContextSecret = secret;
}

export function getInternalContextSecret(): Buffer {
  if (!internalContextSecret) {
    throw new Error('Internal context secret has not been initialised');
  }
  return internalContextSecret;
}

// Test-only reset so suites can install their own secret between cases.
export function resetInternalContextSecret(): void {
  internalContextSecret = undefined;
}
