import { shortHex } from '../../mpt/bytes';

function parseStorage(message: string): string | undefined {
  const embedded = message.match(/->\s*embedded\s*\((\d+)\s*bytes\)/i);
  if (embedded) {
    return `stored inline (${embedded[1]} bytes)`;
  }

  const hashed = message.match(/->\s*hash-ref\s*(0x[0-9a-f]+)/i);
  if (hashed) {
    return `stored by hash reference (${shortHex(hashed[1], 6)})`;
  }

  return undefined;
}

function parseBranchIndex(message: string): string | undefined {
  const match = message.match(/@([0-9a-f])\b/i) ?? message.match(/index\s+([0-9a-f])\b/i);
  return match ? match[1].toLowerCase() : undefined;
}

function stripStorageSuffix(message: string): string {
  return message
    .replace(/\s*->\s*embedded\s*\(\d+\s*bytes\)\s*$/i, '')
    .replace(/\s*->\s*hash-ref\s*0x[0-9a-f]+\s*$/i, '')
    .trim();
}

function withStorage(summary: string, storage?: string): string {
  if (!storage) {
    return summary;
  }
  return `${summary}; ${storage}.`;
}

export function humanizeStepMessage(message: string): string {
  const storage = parseStorage(message);
  const branchIndex = parseBranchIndex(message);
  const base = stripStorageSuffix(message);
  const lower = base.toLowerCase();

  if (lower.startsWith('finalize split old leaf child')) {
    return withStorage(
      `Split existing leaf path and keep the previous leaf under branch index ${branchIndex ?? '?'}`,
      storage,
    );
  }

  if (lower.startsWith('finalize split new leaf child')) {
    return withStorage(`Create new leaf under branch index ${branchIndex ?? '?'}`, storage);
  }

  if (lower.startsWith('finalize split old extension child')) {
    return withStorage(
      `Split existing extension path and keep the previous extension under branch index ${branchIndex ?? '?'}`,
      storage,
    );
  }

  if (lower.startsWith('finalize split branch')) {
    return withStorage('Finalize the split branch node that now holds both paths', storage);
  }

  if (lower.startsWith('finalize shared extension')) {
    return withStorage('Finalize shared extension for the common key prefix', storage);
  }

  if (lower.startsWith('finalize branch child update')) {
    return withStorage(`Finalize branch after updating child index ${branchIndex ?? '?'}`, storage);
  }

  if (lower.startsWith('finalize branch value update')) {
    return withStorage('Finalize branch after updating its value slot', storage);
  }

  if (lower.startsWith('finalize extension after child update')) {
    return withStorage('Finalize extension after child path rewrite', storage);
  }

  if (lower.startsWith('finalize new leaf')) {
    return withStorage('Finalize newly created leaf for remaining key path', storage);
  }

  if (lower.startsWith('finalize updated leaf')) {
    return withStorage('Finalize existing leaf after value update', storage);
  }

  let friendly = base.replace(/@([0-9a-f])\b/gi, (_, idx: string) => `at branch index ${idx.toLowerCase()}`);
  friendly = friendly.replace(/\bhash-ref\b/gi, 'hash reference');

  if (storage) {
    return withStorage(friendly, storage);
  }

  return friendly;
}
