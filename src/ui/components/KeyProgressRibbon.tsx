interface KeyProgressRibbonProps {
  fullKeyNibbles: number[];
  consumedCount: number;
  activeNibbleIndex?: number;
  title?: string;
}

export function KeyProgressRibbon(props: KeyProgressRibbonProps) {
  if (props.fullKeyNibbles.length === 0) {
    return (
      <div className="key-progress">
        <span className="key-progress-title">{props.title ?? 'Key Progress'}</span>
        <span className="muted">No key selected for this step.</span>
      </div>
    );
  }

  return (
    <div className="key-progress">
      <span className="key-progress-title">{props.title ?? 'Key Progress (keccak(address) nibbles)'}</span>
      <div className="key-progress-row">
        {props.fullKeyNibbles.map((nibble, index) => {
          const consumed = index < props.consumedCount;
          const active = props.activeNibbleIndex !== undefined && nibble === props.activeNibbleIndex && index === props.consumedCount;
          return (
            <span
              key={`n-${index}`}
              className={[
                'key-nibble',
                consumed ? 'key-nibble-consumed' : 'key-nibble-remaining',
                active ? 'key-nibble-active' : '',
              ].join(' ')}
              title={`index ${index} | nibble ${nibble.toString(16)} | ${consumed ? 'consumed' : 'remaining'}`}
            >
              {nibble.toString(16)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
