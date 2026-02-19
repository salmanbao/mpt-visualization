import { shortHex } from '../mpt/bytes';
import type { GeneratedAccount } from '../mpt/account';

interface AccountListProps {
  accounts: GeneratedAccount[];
  selectedAddress: string;
}

export function AccountList({ accounts, selectedAddress }: AccountListProps) {
  return (
    <section className="account-list">
      <h2>Generated accounts</h2>
      <div className="account-list-grid">
        {accounts.map((account) => (
          <article
            key={account.address}
            className={`account-card ${account.address === selectedAddress ? 'account-card-active' : ''}`}
          >
            <div className="account-label">{shortHex(account.address, 8)}</div>
            <div className="account-value">balance {account.balance.toString()}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
