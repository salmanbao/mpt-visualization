import { useEffect, useMemo, useState } from 'react';
import { generateAccounts, type GeneratedAccount } from './mpt/account';
import { describeRoot, buildTrieGraph } from './mpt/trie';
import { InMemoryKvStore } from './store/kv';
import { clearIndexedDb, indexedDbAvailable, persistEntriesToIndexedDb } from './store/indexeddb';
import { AccountList } from './ui/AccountList';
import { ControlBar } from './ui/ControlBar';
import { DbPanel } from './ui/DbPanel';
import { InfoBar } from './ui/InfoBar';
import { TriePanel } from './ui/TriePanel';
import { CommitmentCard } from './ui/components/CommitmentCard';
import { EventLogPanel } from './ui/components/EventLogPanel';
import { LessonRail } from './ui/components/LessonRail';
import { buildPedagogicalSteps } from './ui/utils/stepPedagogy';
import { simulateBuild, simulateLookup, simulateUpdate, type SimulationMode, type SimulationStep } from './mpt/simulator';
import './index.css';

const DEFAULT_SEED = 1;
const DEFAULT_COUNT = 8;
const INITIAL_ACCOUNTS = generateAccounts(DEFAULT_SEED, DEFAULT_COUNT);

function selectedAccount(accounts: GeneratedAccount[], address: string): GeneratedAccount | undefined {
  return accounts.find((account) => account.address === address);
}

export default function App() {
  const [seed, setSeed] = useState(String(DEFAULT_SEED));
  const [accountCount, setAccountCount] = useState(DEFAULT_COUNT);
  const [accounts, setAccounts] = useState<GeneratedAccount[]>(INITIAL_ACCOUNTS);
  const [mode, setMode] = useState<SimulationMode>('insert');
  const [selectedAddress, setSelectedAddress] = useState(INITIAL_ACCOUNTS[0]?.address ?? '');
  const [updateBalance, setUpdateBalance] = useState(INITIAL_ACCOUNTS[0]?.balance.toString() ?? '0');

  const [rootRef, setRootRef] = useState<Uint8Array>(new Uint8Array());
  const [db, setDb] = useState<InMemoryKvStore>(() => new InMemoryKvStore());

  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const [debugMode, setDebugMode] = useState(false);
  const [learningMode, setLearningMode] = useState(true);
  const [useCache, setUseCache] = useState(true);
  const [indexedDbMode, setIndexedDbMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [manualDbRevealKey, setManualDbRevealKey] = useState<string>();

  const currentStep = steps.length === 0 ? undefined : steps[Math.min(stepIndex, steps.length - 1)];
  const displayRootRef = currentStep?.rootRef ?? rootRef;
  const displayEntries = currentStep?.dbEntries ?? db.entries();

  const graph = useMemo(
    () => buildTrieGraph(displayRootRef, InMemoryKvStore.fromEntries(displayEntries)),
    [displayEntries, displayRootRef],
  );
  const pedSteps = useMemo(() => buildPedagogicalSteps(steps), [steps]);
  const currentPedStep = steps.length === 0 ? undefined : pedSteps[Math.min(stepIndex, pedSteps.length - 1)];
  const rootDisplay = useMemo(() => describeRoot(displayRootRef), [displayRootRef]);

  const referencedBy = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const edge of graph.edges) {
      if (edge.refKind !== 'hash-ref') {
        continue;
      }
      if (!map[edge.to]) {
        map[edge.to] = [];
      }
      map[edge.to].push(edge.from);
    }
    return map;
  }, [graph.edges]);

  const graphNodeIds = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph.nodes]);

  const effectiveActiveNodeId = useMemo(() => {
    if (!currentStep || steps.length === 0) {
      return undefined;
    }

    const pickCandidate = (step: SimulationStep): string | undefined => {
      const candidates = [step.activeNodeId, step.activeNode?.hashHex, step.activeNode?.refHex];
      for (const candidate of candidates) {
        if (candidate && graphNodeIds.has(candidate)) {
          return candidate;
        }
      }
      return undefined;
    };

    const direct = pickCandidate(currentStep);
    if (direct) {
      return direct;
    }

    for (let i = Math.min(stepIndex, steps.length - 1); i >= 0; i -= 1) {
      const found = pickCandidate(steps[i]);
      if (found) {
        return found;
      }
    }

    return undefined;
  }, [currentStep, graphNodeIds, stepIndex, steps]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const previousRootHex =
    stepIndex > 0 && steps[stepIndex - 1] ? describeRoot(steps[stepIndex - 1].rootRef).commitmentHex : undefined;
  const currentRootHex =
    currentStep ? describeRoot(currentStep.rootRef).commitmentHex : describeRoot(rootRef).commitmentHex;
  const keyRibbonNibbles = currentPedStep?.fullKeyNibbles ?? [];
  const keyRibbonConsumed = currentPedStep?.consumedCount ?? 0;
  const keyRibbonActiveNibble = currentPedStep?.activeNibbleIndex;

  useEffect(() => {
    if (steps.length === 0) {
      setStepIndex(0);
      return;
    }
    if (stepIndex > steps.length - 1) {
      setStepIndex(steps.length - 1);
    }
  }, [stepIndex, steps.length]);

  useEffect(() => {
    setManualDbRevealKey(undefined);
  }, [stepIndex, steps]);

  useEffect(() => {
    if (!playing || steps.length === 0) {
      return;
    }
    const delay = Math.max(100, 1100 - speed * 95);
    const timer = window.setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= steps.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [playing, speed, steps.length]);

  useEffect(() => {
    if (!indexedDbMode || !indexedDbAvailable()) {
      return;
    }
    void persistEntriesToIndexedDb(db.entries());
  }, [db, indexedDbMode]);

  const handleGenerate = (): void => {
    const parsed = Number.parseInt(seed, 10);
    const normalizedSeed = Number.isFinite(parsed) ? parsed : DEFAULT_SEED;
    const generated = generateAccounts(normalizedSeed, accountCount);
    setAccounts(generated);
    setSelectedAddress(generated[0]?.address ?? '');
    setUpdateBalance(generated[0]?.balance.toString() ?? '0');
  };

  const handleStepChange = (nextIndex: number): void => {
    if (steps.length === 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setStepIndex(clamped);
    setPlaying(false);
  };

  const handleBuild = (): void => {
    if (accounts.length === 0) {
      return;
    }
    const result = simulateBuild(accounts);
    setMode('insert');
    setRootRef(result.rootRef);
    setDb(result.db);
    setSteps(result.steps);
    setStepIndex(0);
    setPlaying(false);
    setSelectedNodeId(undefined);
    setManualDbRevealKey(undefined);
  };

  const handleLookup = (): void => {
    const picked = selectedAccount(accounts, selectedAddress);
    if (!picked) {
      return;
    }
    const baseDb = InMemoryKvStore.fromEntries(displayEntries);
    const result = simulateLookup(displayRootRef, baseDb, picked, useCache);
    setSteps(result.steps);
    setStepIndex(0);
    setPlaying(false);
    setSelectedNodeId(undefined);
    setManualDbRevealKey(undefined);
  };

  const handleUpdate = (): void => {
    const picked = selectedAccount(accounts, selectedAddress);
    if (!picked) {
      return;
    }
    let nextBalance: bigint;
    try {
      nextBalance = BigInt(updateBalance);
    } catch {
      return;
    }
    const workingDb = InMemoryKvStore.fromEntries(displayEntries);
    const result = simulateUpdate(displayRootRef, workingDb, picked, nextBalance, useCache);
    setRootRef(result.rootRef);
    setDb(result.db);
    setSteps(result.steps);
    setStepIndex(0);
    setPlaying(false);
    setSelectedNodeId(undefined);
    setManualDbRevealKey(undefined);
    setAccounts((prev) => prev.map((entry) => (entry.address === selectedAddress ? result.updatedAccount : entry)));
  };

  const handleReset = (): void => {
    setRootRef(new Uint8Array());
    setDb(new InMemoryKvStore());
    setSteps([]);
    setStepIndex(0);
    setPlaying(false);
    setSelectedNodeId(undefined);
    setManualDbRevealKey(undefined);
    if (indexedDbMode) {
      void clearIndexedDb();
    }
  };

  return (
    <div className="app-shell">
      <ControlBar
        seed={seed}
        accountCount={accountCount}
        mode={mode}
        selectedAddress={selectedAddress}
        updateBalance={updateBalance}
        speed={speed}
        playing={playing}
        canPrev={stepIndex > 0}
        canNext={steps.length > 0 && stepIndex < steps.length - 1}
        debugMode={debugMode}
        learningMode={learningMode}
        useCache={useCache}
        indexedDbMode={indexedDbMode}
        accounts={accounts}
        onSeedChange={setSeed}
        onAccountCountChange={setAccountCount}
        onGenerate={handleGenerate}
        onBuild={handleBuild}
        onModeChange={setMode}
        onSelectAddress={(value) => {
          setSelectedAddress(value);
          const picked = selectedAccount(accounts, value);
          if (picked) {
            setUpdateBalance(picked.balance.toString());
          }
        }}
        onLookup={handleLookup}
        onRunUpdate={handleUpdate}
        onUpdateBalanceChange={setUpdateBalance}
        onPrev={() => handleStepChange(stepIndex - 1)}
        onNext={() => handleStepChange(stepIndex + 1)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onSpeedChange={setSpeed}
        onDebugModeChange={setDebugMode}
        onLearningModeChange={setLearningMode}
        onUseCacheChange={setUseCache}
        onIndexedDbModeChange={setIndexedDbMode}
        onReset={handleReset}
      />

      <AccountList accounts={accounts} selectedAddress={selectedAddress} />

      <div className="state-banner">
        <span>Current mode: {mode}</span>
        <span>DB backend: {indexedDbMode ? 'memory + IndexedDB mirror' : 'memory'}</span>
        <span>Operation steps: {steps.length}</span>
      </div>

      <main className="split-layout">
        <TriePanel
          graph={graph}
          activeNodeId={effectiveActiveNodeId}
          changedNodeIds={currentStep?.changedNodeIds ?? []}
          selectedNodeId={selectedNodeId}
          currentStep={currentStep}
          keyNibbles={keyRibbonNibbles}
          consumedCount={keyRibbonConsumed}
          activeNibbleIndex={keyRibbonActiveNibble}
          learningMode={learningMode}
          playing={playing}
          onSelectNode={(node) => setSelectedNodeId(node.id)}
          onSelectNodeId={setSelectedNodeId}
          debugMode={debugMode}
        />
        <DbPanel
          entries={displayEntries}
          highlightedKey={manualDbRevealKey ?? currentStep?.highlightedDbKey}
          revealKey={manualDbRevealKey}
          dbAction={currentStep?.dbAction}
          referencedBy={referencedBy}
          activeNodeId={effectiveActiveNodeId}
          learningMode={learningMode}
          debugMode={debugMode}
        />
      </main>

      {learningMode && (
        <>
          <CommitmentCard
            previousRoot={previousRootHex}
            currentRoot={currentRootHex}
            changedNodes={currentStep?.changedNodeIds.length ?? 0}
          />
          <LessonRail pedStep={currentPedStep} stepIndex={stepIndex} totalSteps={steps.length} />
        </>
      )}

      <EventLogPanel
        steps={steps}
        pedSteps={pedSteps}
        stepIndex={stepIndex}
        onStepChange={handleStepChange}
        debugMode={debugMode}
        learningMode={learningMode}
        onRevealDbKey={(key) => setManualDbRevealKey(key)}
        onFocusNode={(nodeId) => setSelectedNodeId(nodeId)}
      />

      <InfoBar root={rootDisplay} currentStep={currentStep} selectedNode={selectedNode} debugMode={debugMode} />
    </div>
  );
}
