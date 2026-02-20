import type { GeneratedAccount } from '../mpt/account';
import { bytesToHex } from '../mpt/bytes';
import { CopyableHex } from './components/CopyableHex';

interface AccountListProps {
  accounts: GeneratedAccount[];
  selectedAddress: string;
  processingAddress?: string;
}

export function AccountList({ accounts, selectedAddress, processingAddress }: AccountListProps) {
  return (
    <section className="account-list">
      <h2>Generated accounts</h2>
      <div className="account-list-grid">
        {accounts.map((account) => {
          const isSelected = account.address === selectedAddress;
          const isProcessing = account.address === processingAddress;
          return (
            <article
              key={account.address}
              className={`account-card ${isSelected ? 'account-card-active' : ''} ${isProcessing ? 'account-card-processing' : ''}`}
            >
              <div className="account-label">
                <CopyableHex value={account.address} edge={8} />
              </div>
              <div className="account-key-line">
                <span className="account-key-label">key</span>
                <CopyableHex value={bytesToHex(account.keyHash)} edge={10} className="account-key-value" />
              </div>
              <div className="account-value">balance {account.balance.toString()}</div>
              {isProcessing && <div className="account-progress-badge">processing</div>}
              {!isProcessing && isSelected && <div className="account-progress-badge">selected</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
