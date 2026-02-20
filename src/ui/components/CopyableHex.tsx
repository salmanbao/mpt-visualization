import { shortHex } from '../../mpt/bytes';

interface CopyableHexProps {
  value?: string;
  edge?: number;
  className?: string;
  allowCopyNonHex?: boolean;
}

const HEX_PATTERN = /^0x[0-9a-f]*$/i;

export function CopyableHex(props: CopyableHexProps) {
  const normalized = props.value?.trim() ?? '';
  const isHex = HEX_PATTERN.test(normalized);
  const canCopy = normalized.length > 0 && normalized !== '-' && (props.allowCopyNonHex || isHex);
  const display = props.edge !== undefined && isHex ? shortHex(normalized, props.edge) : normalized || '-';

  return (
    <span className={`copyable-hex ${props.className ?? ''}`.trim()}>
      <code title={canCopy ? normalized : undefined}>{display}</code>
      {canCopy && (
        <button
          type="button"
          className="mini-button"
          onClick={() => {
            void navigator.clipboard?.writeText(normalized);
          }}
          title="Copy"
        >
          copy
        </button>
      )}
    </span>
  );
}
