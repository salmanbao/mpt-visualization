import { decodeCompactPath, encodeCompactPath } from './hexPrefix';

describe('hex-prefix compact encoding', () => {
  it.each([
    { path: [] as number[], isLeaf: true },
    { path: [] as number[], isLeaf: false },
    { path: [1], isLeaf: true },
    { path: [0xa, 0xb, 0xc], isLeaf: false },
    { path: [0, 1, 2, 3, 4, 5], isLeaf: true },
    { path: [0xf, 0, 0xf, 0], isLeaf: false },
  ])('roundtrips path $path leaf=$isLeaf', ({ path, isLeaf }) => {
    const encoded = encodeCompactPath(path, isLeaf);
    const decoded = decodeCompactPath(encoded);
    expect(decoded).toEqual({ nibbles: path, isLeaf });
  });
});
