import { useEffect, useMemo, useRef, useState } from 'react';
import { bytesToHex } from './mpt/bytes';
import { generateAccounts, type GeneratedAccount } from './mpt/account';
import { describeRoot, buildTrieGraph } from './mpt/trie';
import type { TrieGraph } from './mpt/types';
import { InMemoryKvStore } from './store/kv';
import { clearIndexedDb, indexedDbAvailable, persistEntriesToIndexedDb } from './store/indexeddb';
import { AccountList } from './ui/AccountList';
import { ControlBar } from './ui/ControlBar';
import { DbPanel } from './ui/DbPanel';
import { InfoBar } from './ui/InfoBar';
import { TriePanel } from './ui/TriePanel';
import { CommitmentCard, type RootTransitionPoint } from './ui/components/CommitmentCard';
import { EventLogPanel } from './ui/components/EventLogPanel';
import { LessonRail } from './ui/components/LessonRail';
import { GuidedStoryCard } from './ui/components/GuidedStoryCard';
import { KeyDerivationCard } from './ui/components/KeyDerivationCard';
import { WalkthroughOverlay } from './ui/components/WalkthroughOverlay';
import { type LearningLens } from './ui/types/learning';
import { buildPedagogicalSteps } from './ui/utils/stepPedagogy';
import { buildStepFrames } from './ui/utils/stepViewModel';
import { simulateBuild, simulateLookup, simulateUpdate, type SimulationMode, type SimulationStep } from './mpt/simulator';
import './index.css';

const DEFAULT_SEED = 1;
const DEFAULT_COUNT = 8;
const INITIAL_ACCOUNTS = generateAccounts(DEFAULT_SEED, DEFAULT_COUNT);
const WALKTHROUGH_STORAGE_KEY = 'mpt_walkthrough_v1_dismissed';

function selectedAccount(accounts: GeneratedAccount[], address: string): GeneratedAccount | undefined {
  return accounts.find((account) => account.address === address);
}

function isOperationStartStep(step: SimulationStep): boolean {
  const title = step.title.toUpperCase();
  if (title.includes('LOOKUP START') || title.includes('UPDATE START') || title.includes('BUILD START')) {
    return true;
  }
  if (step.mode === 'insert' && title.includes('INSERT ACCOUNT')) {
    return true;
  }
  return false;
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
  const [lens, setLens] = useState<LearningLens>('foundational');
  const [useCache, setUseCache] = useState(true);
  const [indexedDbMode, setIndexedDbMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [manualDbRevealKey, setManualDbRevealKey] = useState<string>();
  const [eventLogInternalsToken, setEventLogInternalsToken] = useState<number>();
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  const graphCacheRef = useRef<Map<string, TrieGraph>>(new Map());

  const currentStep = steps.length === 0 ? undefined : steps[Math.min(stepIndex, steps.length - 1)];
  const displayRootRef = currentStep?.rootRef ?? rootRef;
  const displayEntries = currentStep?.dbEntries ?? db.entries();

  const graphCacheKey = useMemo(() => {
    const rootHex = bytesToHex(displayRootRef);
    const entriesSig = displayEntries.map((entry) => `${entry.keyHex}:${entry.valueSize}`).join('|');
    return `${rootHex}::${entriesSig}`;
  }, [displayEntries, displayRootRef]);

  const graph = useMemo(() => {
    const cached = graphCacheRef.current.get(graphCacheKey);
    if (cached) {
      return cached;
    }
    const built = buildTrieGraph(displayRootRef, InMemoryKvStore.fromEntries(displayEntries), { includeDetachedHashes: true });
    graphCacheRef.current.set(graphCacheKey, built);
    if (graphCacheRef.current.size > 120) {
      const oldest = graphCacheRef.current.keys().next().value;
      if (oldest) {
        graphCacheRef.current.delete(oldest);
      }
    }
    return built;
  }, [displayEntries, displayRootRef, graphCacheKey]);

  const pedSteps = useMemo(() => buildPedagogicalSteps(steps), [steps]);
  const stepFrames = useMemo(() => buildStepFrames(steps, pedSteps), [pedSteps, steps]);
  const currentPedStep = steps.length === 0 ? undefined : pedSteps[Math.min(stepIndex, pedSteps.length - 1)];
  const currentStepFrame = steps.length === 0 ? undefined : stepFrames[Math.min(stepIndex, stepFrames.length - 1)];
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

  const effectiveSelectedAccount = useMemo(
    () => selectedAccount(accounts, selectedAddress) ?? accounts[0],
    [accounts, selectedAddress],
  );

  const activeProcessingAccount = useMemo(() => {
    const keyHashHex = currentStepFrame?.keyDerivation.keyHashHex;
    if (!keyHashHex) {
      return undefined;
    }
    return accounts.find((account) => bytesToHex(account.keyHash) === keyHashHex);
  }, [accounts, currentStepFrame?.keyDerivation.keyHashHex]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const beforeRootHex = currentPedStep?.rootTransition.beforeHex;
  const afterRootHex = currentPedStep?.rootTransition.afterHex ?? describeRoot(rootRef).commitmentHex;
  const operationStartRoot = currentPedStep?.rootTransition.operationStartHex;
  const keyRibbonNibbles = currentPedStep?.fullKeyNibbles ?? [];
  const keyRibbonConsumed = currentPedStep?.consumedAfter ?? 0;
  const keyRibbonActivePosition = currentPedStep?.activeNibblePosition;
  const decisionNibble = currentPedStep?.decisionNibble;
  const pathOnlyFocusEnabled = learningMode && lens === 'foundational' && (currentStepFrame?.focusNodeIds.length ?? 0) > 0;

  const operationRange = useMemo(() => {
    if (steps.length === 0) {
      return { start: 0, end: -1 };
    }
    const end = Math.min(stepIndex, steps.length - 1);
    let start = end;
    while (start > 0 && !isOperationStartStep(steps[start])) {
      start -= 1;
    }
    return { start, end };
  }, [stepIndex, steps]);

  const rootTransitions = useMemo<RootTransitionPoint[]>(() => {
    if (operationRange.end < operationRange.start) {
      return [];
    }
    const out: RootTransitionPoint[] = [];
    for (let i = operationRange.start; i <= operationRange.end; i += 1) {
      const ped = pedSteps[i];
      if (!ped || !ped.impact.rootChanged) {
        continue;
      }
      out.push({
        stepIndex: i,
        beforeRoot: ped.rootTransition.beforeHex,
        afterRoot: ped.rootTransition.afterHex,
      });
    }
    return out;
  }, [operationRange.end, operationRange.start, pedSteps]);

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

  useEffect(() => {
    if (!effectiveSelectedAccount) {
      if (selectedAddress !== '') {
        setSelectedAddress('');
      }
      return;
    }

    if (selectedAddress !== effectiveSelectedAccount.address) {
      setSelectedAddress(effectiveSelectedAccount.address);
      setUpdateBalance(effectiveSelectedAccount.balance.toString());
    }
  }, [effectiveSelectedAccount, selectedAddress]);

  useEffect(() => {
    if (!learningMode || lens !== 'foundational') {
      setWalkthroughOpen(false);
      return;
    }
    const dismissed = window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === '1';
    if (!dismissed) {
      setWalkthroughOpen(true);
    }
  }, [learningMode, lens]);

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
    const picked = effectiveSelectedAccount;
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
    const picked = effectiveSelectedAccount;
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
    setAccounts((prev) => prev.map((entry) => (entry.address === picked.address ? result.updatedAccount : entry)));
    setSelectedAddress(picked.address);
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

  const handleShowInternals = (): void => {
    setEventLogInternalsToken((prev) => (prev ?? 0) + 1);
  };

  const handleNeverShowWalkthrough = (): void => {
    window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1');
    setWalkthroughOpen(false);
  };

  return (
    <div className={`app-shell ${learningMode ? `lens-${lens}` : 'lens-expert'}`}>
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
        lens={lens}
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
        onLensChange={setLens}
        onUseCacheChange={setUseCache}
        onIndexedDbModeChange={setIndexedDbMode}
        onShowWalkthrough={() => setWalkthroughOpen(true)}
        onReset={handleReset}
      />

      {learningMode && lens === 'foundational' && (
        <section className="learning-primer-grid">
          <GuidedStoryCard
            stepFrame={currentStepFrame}
            stepIndex={stepIndex}
            totalSteps={steps.length}
            onShowInternals={handleShowInternals}
          />
          <KeyDerivationCard account={activeProcessingAccount ?? effectiveSelectedAccount} stepFrame={currentStepFrame} />
        </section>
      )}

      <AccountList
        accounts={accounts}
        selectedAddress={selectedAddress}
        processingAddress={activeProcessingAccount?.address}
      />

      <div className="state-banner">
        <span>Current mode: {mode}</span>
        <span>DB backend: {indexedDbMode ? 'memory + IndexedDB mirror' : 'memory'}</span>
        <span>Operation steps: {steps.length}</span>
        {learningMode && <span>Lens: {lens}</span>}
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
          activeNibblePosition={keyRibbonActivePosition}
          decisionNibble={decisionNibble}
          learningMode={learningMode}
          lens={lens}
          stepFrame={currentStepFrame}
          focusNodeIds={currentStepFrame?.focusNodeIds ?? []}
          focusEdgeIds={currentStepFrame?.focusEdgeIds ?? []}
          pathOnlyFocusEnabled={pathOnlyFocusEnabled}
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
          activeNode={currentStep?.activeNode}
          learningMode={learningMode}
          lens={lens}
          stepFrame={currentStepFrame}
          debugMode={debugMode}
        />
      </main>

      {learningMode && (
        <>
          <CommitmentCard
            beforeRoot={beforeRootHex}
            afterRoot={afterRootHex}
            operationStartRoot={operationStartRoot}
            changedNodes={currentStep?.changedNodeIds.length ?? 0}
            transitions={rootTransitions}
            onJumpToStep={handleStepChange}
          />
          {lens !== 'foundational' && (
            <LessonRail stepFrame={currentStepFrame} stepIndex={stepIndex} totalSteps={steps.length} lens={lens} />
          )}
        </>
      )}

      <EventLogPanel
        steps={steps}
        pedSteps={pedSteps}
        stepFrames={stepFrames}
        stepIndex={stepIndex}
        onStepChange={handleStepChange}
        debugMode={debugMode}
        learningMode={learningMode}
        lens={lens}
        forceShowInternalsKey={eventLogInternalsToken}
        onRevealDbKey={(key) => setManualDbRevealKey(key)}
        onFocusNode={(nodeId) => setSelectedNodeId(nodeId)}
      />

      <InfoBar
        root={rootDisplay}
        currentStep={currentStep}
        pedStep={currentPedStep}
        selectedNode={selectedNode}
        debugMode={debugMode}
        learningMode={learningMode}
        lens={lens}
      />

      <WalkthroughOverlay
        open={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
        onNeverShow={handleNeverShowWalkthrough}
      />
    </div>
  );
}





