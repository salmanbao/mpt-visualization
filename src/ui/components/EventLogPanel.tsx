import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationStep } from '../../mpt/simulator';
import { formatStep, stepMatchesFilter, type EventLogFilter, type FormattedStep } from '../utils/stepFormat';
import type { LearningLens } from '../types/learning';
import type { PedagogicalStep } from '../utils/stepPedagogy';
import type { StepFrame } from '../utils/stepViewModel';
import { StepDetails } from './StepDetails';

interface EventLogPanelProps {
  steps: SimulationStep[];
  pedSteps: PedagogicalStep[];
  stepFrames: StepFrame[];
  stepIndex: number;
  onStepChange: (index: number) => void;
  debugMode: boolean;
  learningMode: boolean;
  lens: LearningLens;
  forceShowInternalsKey?: number;
  onRevealDbKey?: (key: string) => void;
  onFocusNode?: (nodeId: string) => void;
}

type LogDensity = 'compact' | 'comfortable';

const LOG_HEIGHT = 248;
const ROW_HEIGHT: Record<LogDensity, number> = {
  compact: 56,
  comfortable: 74,
};
const OVERSCAN = 8;
const FILTERS: EventLogFilter[] = ['all', 'trie', 'db', 'key', 'root', 'cache'];

interface EventRowProps {
  step: FormattedStep;
  pedStep?: PedagogicalStep;
  isCurrent: boolean;
  top: number;
  height: number;
  learningMode: boolean;
  showInternals: boolean;
  lens: LearningLens;
  onSelect: (index: number) => void;
}

const EventRow = memo(function EventRow(props: EventRowProps) {
  const message =
    props.learningMode && props.pedStep
      ? props.lens === 'foundational'
        ? props.pedStep.conciseText
        : props.pedStep.lensText[props.lens]
      : props.step.message;

  const showChips = !props.learningMode || props.lens !== 'foundational' || props.showInternals;

  return (
    <button
      type="button"
      className={`event-row ${props.isCurrent ? 'event-row-current' : ''} event-row-${props.step.category}`}
      style={{ top: `${props.top}px`, height: `${props.height - 4}px` }}
      onClick={() => props.onSelect(props.step.index)}
    >
      <span className="event-step-no">{props.step.index + 1}</span>
      <span className="event-badge">{props.step.badge}</span>
      <span className="event-message">{message}</span>
      <span className={`event-chip-list ${showChips ? '' : 'event-chip-list-muted'}`}>
        {props.step.chips.slice(0, 5).map((chip, index) => (
          <span key={`${chip.label}-${index}`} className="event-chip">
            {chip.label}
          </span>
        ))}
      </span>
    </button>
  );
});

export function EventLogPanel(props: EventLogPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EventLogFilter>('all');
  const [autoFollow, setAutoFollow] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showInternals, setShowInternals] = useState(!props.learningMode || props.lens !== 'foundational');
  const [density, setDensity] = useState<LogDensity>('comfortable');
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(LOG_HEIGHT);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowInternals(!props.learningMode || props.lens !== 'foundational');
  }, [props.learningMode, props.lens]);

  useEffect(() => {
    if (props.forceShowInternalsKey === undefined) {
      return;
    }
    setShowInternals(true);
    setDetailsOpen(true);
  }, [props.forceShowInternalsKey]);

  const rowHeight = ROW_HEIGHT[density];
  const formattedSteps = useMemo(() => props.steps.map((step, index) => formatStep(step, index)), [props.steps]);
  const filteredIndexes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const out: number[] = [];
    for (const step of formattedSteps) {
      if (!stepMatchesFilter(step, filter)) {
        continue;
      }
      const ped = props.pedSteps[step.index];
      const frame = props.stepFrames[step.index];
      const searchable = `${step.searchable} ${ped?.whyText ?? ''} ${ped?.whatText ?? ''} ${frame?.mechanism ?? ''}`.toLowerCase();
      if (query && !searchable.includes(query)) {
        continue;
      }
      out.push(step.index);
    }
    return out;
  }, [filter, formattedSteps, props.pedSteps, props.stepFrames, search]);

  const selectedStep = props.steps[props.stepIndex];
  const selectedFormatted = formattedSteps[props.stepIndex];
  const selectedPed = props.pedSteps[props.stepIndex];
  const selectedFrame = props.stepFrames[props.stepIndex];
  const selectedVisibleIndex = filteredIndexes.indexOf(props.stepIndex);
  const totalHeight = filteredIndexes.length * rowHeight;

  const windowStart = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const windowCount = Math.ceil(listHeight / rowHeight) + OVERSCAN * 2;
  const windowEnd = Math.min(filteredIndexes.length, windowStart + windowCount);
  const visibleIndexes = filteredIndexes.slice(windowStart, windowEnd);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    const updateHeight = (): void => {
      setListHeight(Math.max(rowHeight * 2, node.clientHeight));
    };
    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    return () => observer.disconnect();
  }, [rowHeight]);

  useEffect(() => {
    if (!autoFollow) {
      return;
    }
    if (selectedVisibleIndex < 0) {
      return;
    }
    const node = listRef.current;
    if (!node) {
      return;
    }
    const top = selectedVisibleIndex * rowHeight;
    const bottom = top + rowHeight;
    if (top < node.scrollTop) {
      node.scrollTop = Math.max(0, top - rowHeight * 2);
    } else if (bottom > node.scrollTop + node.clientHeight) {
      node.scrollTop = Math.max(0, bottom - node.clientHeight + rowHeight * 2);
    }
  }, [autoFollow, rowHeight, selectedVisibleIndex, props.stepIndex]);

  const handleStepSelect = (index: number): void => {
    props.onStepChange(index);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
      return;
    }
    if (event.key === 'Enter') {
      setDetailsOpen((prev) => !prev);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    if (filteredIndexes.length === 0) {
      return;
    }
    const current = filteredIndexes.indexOf(props.stepIndex);
    const safeCurrent = current >= 0 ? current : 0;
    const next = event.key === 'ArrowDown' ? Math.min(filteredIndexes.length - 1, safeCurrent + 1) : Math.max(0, safeCurrent - 1);
    props.onStepChange(filteredIndexes[next]);
  };

  const resetView = (): void => {
    setSearch('');
    setFilter('all');
    setDensity('comfortable');
  };

  return (
    <section className="event-log-drawer" tabIndex={0} onKeyDown={handleKeyDown}>
      <header className="event-log-head">
        <h3>Event Log</h3>
        <span className="event-step-counter">
          Step {props.steps.length === 0 ? 0 : props.stepIndex + 1} / {props.steps.length}
        </span>
        <input
          className="input event-log-search"
          placeholder="Search message, hash, node type, key prefix"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="event-filter-group">
          {FILTERS.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`mini-button ${filter === entry ? 'mini-button-active' : ''}`}
              onClick={() => setFilter(entry)}
            >
              {entry === 'all' ? 'All' : entry[0].toUpperCase() + entry.slice(1)}
            </button>
          ))}
        </div>
        {props.learningMode && (
          <button type="button" className="mini-button" onClick={() => setShowInternals((prev) => !prev)}>
            {showInternals ? 'Hide internals' : 'Show internals'}
          </button>
        )}
        <button
          type="button"
          className="mini-button"
          onClick={() => setDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))}
        >
          Density: {density}
        </button>
        <label className="toggle event-autofollow">
          <input type="checkbox" checked={autoFollow} onChange={(event) => setAutoFollow(event.target.checked)} />
          Auto-follow
        </label>
        <button type="button" className="button" onClick={resetView}>
          Reset filters
        </button>
      </header>

      {selectedFrame && (
        <div className="event-causality-strip">
          <span>{selectedFrame.causalitySpine[0]}</span>
          <span>{selectedFrame.causalitySpine[1]}</span>
          <span>{selectedFrame.causalitySpine[2]}</span>
        </div>
      )}

      <div className="event-log-body">
        <div className="event-log-list" ref={listRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
          {filteredIndexes.length === 0 ? (
            <div className="event-log-empty">No events match this filter.</div>
          ) : (
            <div className="event-log-virtual" style={{ height: `${totalHeight}px` }}>
              {visibleIndexes.map((rawIndex, localIndex) => {
                const step = formattedSteps[rawIndex];
                const logicalIndex = windowStart + localIndex;
                return (
                  <EventRow
                    key={rawIndex}
                    step={step}
                    pedStep={props.pedSteps[rawIndex]}
                    isCurrent={rawIndex === props.stepIndex}
                    top={logicalIndex * rowHeight}
                    height={rowHeight}
                    learningMode={props.learningMode}
                    showInternals={showInternals}
                    lens={props.lens}
                    onSelect={handleStepSelect}
                  />
                );
              })}
            </div>
          )}
        </div>

        <aside className={`event-log-details-wrap ${detailsOpen ? '' : 'event-log-details-collapsed'}`}>
          <div className="event-details-head">
            <span>Step Details</span>
            <button type="button" className="mini-button" onClick={() => setDetailsOpen((prev) => !prev)}>
              {detailsOpen ? 'collapse' : 'expand'}
            </button>
          </div>
          {detailsOpen && (
            <StepDetails
              step={selectedStep}
              formatted={selectedFormatted}
              pedStep={selectedPed}
              stepFrame={selectedFrame}
              debugMode={props.debugMode}
              learningMode={props.learningMode}
              lens={props.lens}
              forceInternalsKey={props.forceShowInternalsKey}
              onRevealDbKey={props.onRevealDbKey}
              onFocusNode={props.onFocusNode}
            />
          )}
        </aside>
      </div>
    </section>
  );
}
