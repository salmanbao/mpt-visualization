# Ethereum MPT Teaching Simulator

Single-page React + TypeScript app that demonstrates:
- the trie as a conceptual structure
- persisted node storage as hashed RLP-encoded records in a KV database
- traversal by nibble path + DB `GET` (or cache hit)
- persistent updates producing a new root while old content-addressed nodes remain

## Run

```bash
npm install
npm run dev
```

### Build + test

```bash
npm run test
npm run build
```

## What It Models

- Keys use `keccak256(address)` and are traversed as nibbles.
- Node types:
  - Branch: `[child0..child15, value]`
  - Extension: `[encodedPath, child]`
  - Leaf: `[encodedPath, value]`
- Compact (hex-prefix) path encoding is implemented for extension/leaf nodes.
- Nodes are RLP-encoded.
- Reference rule:
  - if `RLP(node).length < 32`, parent embeds raw RLP bytes
  - else parent stores a 32-byte hash reference, and DB stores `hash -> rlp(node)`

## Conceptual Mapping: MPT Node -> DB Entry

- Conceptual trie edge = parent field containing a child reference.
- Physical persistence:
  - embedded ref: child bytes inline in parent RLP, no DB write
  - hash ref: child hash bytes in parent RLP, plus DB row:
    - key: `keccak256(rlp(node))`
    - value: `rlp(node)`

The app’s right panel visualizes this directly as a hash-keyed KV list.

## UI Highlights

- Top controls:
  - seed, account count, generate
  - build trie
  - mode: insert / lookup / update
  - account picker
  - playback (prev/next/play/pause/speed)
  - cache toggle
  - debug toggle
  - optional IndexedDB mode toggle
- Left panel: trie graph with edge labels (`embedded` / `hash-ref`)
- Right panel: DB entries and decode toggles
- Bottom bar: root commitment, operation log, selected node details, explain cards

## Tests Included

- compact hex-prefix encode/decode roundtrip
- trie node RLP encode/decode roundtrip
- insert + lookup consistency for generated accounts
- root stability for fixed seed (`seed=1`, `N=8`)

## Limitations

- IndexedDB mode is implemented as a mirror of in-memory DB state for persistence convenience; core traversal/build simulation reads from the in-memory model.
- Graph layout is deterministic and readable for up to 32 accounts, but not force-directed.
- No deletion / trie pruning flow is included (focus is insert, lookup, and update persistence behavior).
