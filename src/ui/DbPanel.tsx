import { useEffect, useMemo, useRef, useState } from 'react';
import type { DbEntry } from '../store/kv';
import { decodeTrieNode, inspectNode } from '../mpt/nodeCodec';
import { hexToBytes } from '../mpt/bytes';
import type { NodeInspection } from '../mpt/types';
import type { LearningLens } from './types/learning';
import type { StepFrame } from './utils/stepViewModel';
import { CopyableHex } from './components/CopyableHex';

interface DbPanelProps {
  entries: DbEntry[];
  highlightedKey?: string;
  revealKey?: string;
  dbAction?: 'GET' | 'PUT';
  referencedBy: Record<string, string[]>;
  activeNodeId?: string;
  activeNode?: NodeInspection;
  learningMode: boolean;
  lens: LearningLens;
  stepFrame?: StepFrame;
  debugMode: boolean;
}

interface DbInsertionLink {
  sourceKey?: string;
  targetKey: string;
  mode: 'structural' | 'sequence';
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

  const insertionLink = useMemo<DbInsertionLink | undefined>(() => {
    if (props.dbAction !== 'PUT' || !props.highlightedKey) {
      return undefined;
    }

    const target = props.entries.find((entry) => entry.keyHex === props.highlightedKey);
    if (!target) {
      return undefined;
    }

    if (props.activeNode?.branchChildren && props.activeNode.branchChildren.length > 0) {
      const candidates = props.activeNode.branchChildren
        .filter((child) => child.refKind === 'hash-ref' && child.refHex && child.refHex !== target.keyHex)
        .map((child) => props.entries.find((entry) => entry.keyHex === child.refHex))
        .filter((entry): entry is DbEntry => !!entry)
        .filter((entry) => entry.insertedAt < target.insertedAt)
        .sort((a, b) => b.insertedAt - a.insertedAt);

      if (candidates[0]) {
        return {
          sourceKey: candidates[0].keyHex,
          targetKey: target.keyHex,
          mode: 'structural',
        };
      }
    }

    const previous = props.entries
      .filter((entry) => entry.insertedAt < target.insertedAt)
      .sort((a, b) => b.insertedAt - a.insertedAt)[0];

    if (!previous) {
      return undefined;
    }

    return {
      sourceKey: previous.keyHex,
      targetKey: target.keyHex,
      mode: 'sequence',
    };
  }, [props.activeNode, props.dbAction, props.entries, props.highlightedKey]);

  const dbNote =
    props.learningMode && props.highlightedKey
      ? props.stepFrame?.dbReason ??
        `Referenced by active node: ${referencedByActiveNode ? 'yes' : activeRefSources.length > 0 ? 'indirectly' : 'not resolved'}`
      : undefined;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>KV Database (hash -&gt; RLP node)</h3>
        <span>{props.entries.length} hashed nodes</span>
      </div>
      {insertionLink && (
        <div className="db-link-banner">
          <span className="db-link-label">Insertion link</span>
          <span className="db-link-arrow">
            <CopyableHex value={insertionLink.sourceKey} edge={10} />
            <span>-&gt;</span>
            <CopyableHex value={insertionLink.targetKey} edge={10} />
          </span>
          <span className="db-link-mode">{insertionLink.mode === 'structural' ? 'child-ref link' : 'previous insert link'}</span>
        </div>
      )}
      {dbNote && <div className="db-causality-note">{dbNote}</div>}
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
          const isLinkTarget = insertionLink?.targetKey === entry.keyHex;
          const isLinkSource = insertionLink?.sourceKey === entry.keyHex;
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
              className={`db-row ${isHighlighted ? actionClass : ''} ${isLinkSource ? 'db-row-link-source' : ''} ${isLinkTarget ? 'db-row-link-target' : ''}`}
            >
              <span className="db-key-cell">
                <CopyableHex value={entry.keyHex} edge={props.lens === 'researcher' ? 12 : 10} />
                {isLinkTarget && <span className="db-link-node-marker">target</span>}
                {isLinkSource && <span className="db-link-node-marker">source</span>}
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
                {refs.length === 0 ? (
                  '-'
                ) : (
                  <span className="db-ref-list">
                    {refs.map((ref) => (
                      <CopyableHex key={`${entry.keyHex}-${ref}`} value={ref} edge={8} className="db-ref-item" />
                    ))}
                  </span>
                )}
                {isLinkTarget && insertionLink?.sourceKey && (
                  <em className="db-inline-link">
                    linked from <CopyableHex value={insertionLink.sourceKey} edge={8} />
                  </em>
                )}
                {isHighlighted && props.stepFrame?.dbReason && <em className="db-inline-reason">{props.stepFrame.dbReason}</em>}
              </span>
              {expanded[entry.keyHex] && (
                <div className="db-expanded-wrap">
                  <div className="db-expanded-head">
                    <span>value</span>
                    <CopyableHex
                      value={entry.valueHex}
                      edge={props.debugMode || props.lens === 'researcher' ? 20 : 14}
                    />
                  </div>
                  <pre className="db-expanded">
                    {props.debugMode || props.lens === 'researcher' ? entry.valueHex : `${entry.valueHex.slice(0, 160)}...`}
                    {'\n'}
                    {decodedSummary}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
