import type { GeneratedAccount } from '../mpt/account';
import type { SimulationMode } from '../mpt/simulator';

interface ControlBarProps {
  seed: string;
  accountCount: number;
  mode: SimulationMode;
  selectedAddress: string;
  updateBalance: string;
  speed: number;
  playing: boolean;
  canPrev: boolean;
  canNext: boolean;
  debugMode: boolean;
  learningMode: boolean;
  useCache: boolean;
  indexedDbMode: boolean;
  accounts: GeneratedAccount[];
  onSeedChange: (value: string) => void;
  onAccountCountChange: (value: number) => void;
  onGenerate: () => void;
  onBuild: () => void;
  onModeChange: (value: SimulationMode) => void;
  onSelectAddress: (value: string) => void;
  onLookup: () => void;
  onRunUpdate: () => void;
  onUpdateBalanceChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (value: number) => void;
  onDebugModeChange: (value: boolean) => void;
  onLearningModeChange: (value: boolean) => void;
  onUseCacheChange: (value: boolean) => void;
  onIndexedDbModeChange: (value: boolean) => void;
  onReset: () => void;
}

export function ControlBar(props: ControlBarProps) {
  return (
    <header className="control-bar">
      <div className="control-group">
        <label htmlFor="seed-input">Seed</label>
        <input
          id="seed-input"
          value={props.seed}
          onChange={(event) => props.onSeedChange(event.target.value)}
          className="input"
        />
      </div>

      <div className="control-group">
        <label htmlFor="n-select">Generate N accounts</label>
        <select
          id="n-select"
          className="select"
          value={props.accountCount}
          onChange={(event) => props.onAccountCountChange(Number(event.target.value))}
        >
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={32}>32</option>
        </select>
      </div>

      <button type="button" className="button button-accent" onClick={props.onGenerate}>
        Generate
      </button>
      <button type="button" className="button button-accent" onClick={props.onBuild}>
        Build Trie
      </button>

      <div className="control-group">
        <label htmlFor="mode-select">Mode</label>
        <select
          id="mode-select"
          className="select"
          value={props.mode}
          onChange={(event) => props.onModeChange(event.target.value as SimulationMode)}
        >
          <option value="insert">Insert</option>
          <option value="lookup">Lookup</option>
          <option value="update">Update balance</option>
        </select>
      </div>

      <div className="control-group">
        <label htmlFor="account-select">Pick account</label>
        <select
          id="account-select"
          className="select account-select"
          value={props.selectedAddress}
          onChange={(event) => props.onSelectAddress(event.target.value)}
        >
          {props.accounts.map((account) => (
            <option key={account.address} value={account.address}>
              {account.address}
            </option>
          ))}
        </select>
      </div>

      {props.mode === 'lookup' && (
        <button type="button" className="button button-accent" onClick={props.onLookup}>
          Lookup
        </button>
      )}

      {props.mode === 'update' && (
        <>
          <div className="control-group">
            <label htmlFor="new-balance">New balance</label>
            <input
              id="new-balance"
              value={props.updateBalance}
              onChange={(event) => props.onUpdateBalanceChange(event.target.value)}
              className="input"
            />
          </div>
          <button type="button" className="button button-accent" onClick={props.onRunUpdate}>
            Apply Update
          </button>
        </>
      )}

      <div className="step-controls">
        <button type="button" className="button" onClick={props.onPrev} disabled={!props.canPrev}>
          Prev
        </button>
        <button type="button" className="button" onClick={props.onNext} disabled={!props.canNext}>
          Next
        </button>
        {!props.playing ? (
          <button type="button" className="button" onClick={props.onPlay} disabled={!props.canNext}>
            Play
          </button>
        ) : (
          <button type="button" className="button" onClick={props.onPause}>
            Pause
          </button>
        )}
      </div>

      <div className="control-group">
        <label htmlFor="speed-range">Speed</label>
        <input
          id="speed-range"
          type="range"
          min={1}
          max={10}
          step={1}
          value={props.speed}
          onChange={(event) => props.onSpeedChange(Number(event.target.value))}
        />
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={props.useCache}
          onChange={(event) => props.onUseCacheChange(event.target.checked)}
        />
        Use cache
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={props.indexedDbMode}
          onChange={(event) => props.onIndexedDbModeChange(event.target.checked)}
        />
        IndexedDB mode
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={props.debugMode}
          onChange={(event) => props.onDebugModeChange(event.target.checked)}
        />
        Debug mode
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={props.learningMode}
          onChange={(event) => props.onLearningModeChange(event.target.checked)}
        />
        Learning mode
      </label>

      <button type="button" className="button button-danger" onClick={props.onReset}>
        Reset
      </button>
    </header>
  );
}
