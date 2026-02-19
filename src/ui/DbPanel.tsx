import { useEffect, useMemo, useRef, useState } from 'react';
import type { DbEntry } from '../store/kv';
import { decodeTrieNode, inspectNode } from '../mpt/nodeCodec';
import { hexToBytes, shortHex } from '../mpt/bytes';

interface DbPanelProps {
  entries: DbEntry[];
  highlightedKey?: string;
  revealKey?: string;
  dbAction?: 'GET' | 'PUT';
  referencedBy: Record<string, string[]>;
  activeNodeId?: string;
  learningMode: boolean;
  debugMode: boolean;
}

export function DbPanel(props: DbPanelProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return props.entries;
    }
    return props.entries.filter(
      (entry) => entry.keyHex.includes(q) || entry.nodeType.includes(q) || entry.valueHex.includes(q),
    );
  }, [props.entries, search]);

  useEffect(() => {
    const key = props.revealKey ?? props.highlightedKey;
    if (!key) {
      return;
    }
    const node = rowRefs.current[key];
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [props.highlightedKey, props.revealKey]);

  const activeRefSources = props.highlightedKey ? props.referencedBy[props.highlightedKey] ?? [] : [];
  const referencedByActiveNode = props.activeNodeId ? activeRefSources.includes(props.activeNodeId) : false;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>KV Database (hash -&gt; RLP node)</h3>
        <span>{props.entries.length} hashed nodes</span>
      </div>
      {props.learningMode && props.highlightedKey && (
        <div className="db-causality-note">
          Referenced by active node: {referencedByActiveNode ? 'yes' : activeRefSources.length > 0 ? 'indirectly' : 'not resolved'}
        </div>
      )}
      <input
        className="input db-search"
        placeholder="Search hash, node type, value hex"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="db-table">
        <div className="db-header">
          <span>Key</span>
          <span>Bytes</span>
          <span>Node</span>
          <span>Decode</span>
          <span>Referenced by</span>
        </div>
        {filtered.map((entry) => {
          const isHighlighted = props.highlightedKey === entry.keyHex || props.revealKey === entry.keyHex;
          const actionClass = props.dbAction === 'PUT' ? 'db-row-put' : 'db-row-get';
          const refs = props.referencedBy[entry.keyHex] ?? [];

          let decodedSummary = '';
          if (expanded[entry.keyHex]) {
            try {
              const rlp = hexToBytes(entry.valueHex);
              const node = decodeTrieNode(rlp);
              decodedSummary = JSON.stringify(inspectNode(node, rlp, hexToBytes(entry.keyHex)), null, 2);
            } catch (error) {
              decodedSummary = `Decode error: ${(error as Error).message}`;
            }
          }

          return (
            <div
              key={entry.keyHex}
              ref={(node) => {
                rowRefs.current[entry.keyHex] = node;
              }}
              className={`db-row ${isHighlighted ? actionClass : ''}`}
            >
              <span className="db-key-cell">
                <code>{shortHex(entry.keyHex, 10)}</code>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(entry.keyHex);
                  }}
                >
                  copy
                </button>
              </span>
              <span>{entry.valueSize}</span>
              <span>{entry.nodeType}</span>
              <span>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [entry.keyHex]: !prev[entry.keyHex] }))}
                >
                  {expanded[entry.keyHex] ? 'hide' : 'show'}
                </button>
              </span>
              <span>
                {refs.length === 0 ? '-' : refs.map((ref) => shortHex(ref, 8)).join(', ')}
              </span>
              {expanded[entry.keyHex] && (
                <pre className="db-expanded">
                  {props.debugMode ? entry.valueHex : `${entry.valueHex.slice(0, 160)}...`}
                  {'\n'}
                  {decodedSummary}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
