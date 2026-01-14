# Fiat-to-Crypto Onramp Plan for Ohloss

## Executive Summary

This document outlines the architecture for enabling players to purchase USDC with credit cards and receive it directly in their C-address (Soroban contract) wallets. The solution uses a **proxy service** that receives funds at a G-address and forwards them to the user's C-address via the Stellar Asset Contract (SAC).

### Key Constraints
- Most fiat onramp providers only support G-addresses (traditional Stellar accounts)
- C-addresses (Soroban contract addresses) can receive USDC via SAC without trustlines
- Need failsafe mechanisms to ensure user funds are never lost
- Target: US-focused, with EU and global as future expansions
- Volume: Low initially (<$10K/month)
- KYC: Minimal preferred, guest checkout for small amounts ideal

---

## Provider Comparison

### Recommended: MoonPay

| Feature | MoonPay | Coinbase Onramp | Transak |
|---------|---------|-----------------|---------|
| **Stellar USDC Support** | Yes (confirmed) | Unclear (likely no) | XLM yes, USDC unclear |
| **Memo Field Support** | Yes (required for Stellar) | N/A | Yes |
| **Guest Checkout** | NFTs only ($7,500 limit) | Yes ($500/week, US only) | Lite KYC (30s, name+email) |
| **KYC for Crypto** | Required | Required for >$500/week | Lite KYC available |
| **Webhooks** | Yes | Yes | Yes |
| **Fees** | 4.5% + network fees | Standard Stripe-like | Similar to MoonPay |
| **Geographic Coverage** | 80+ countries | US only (guest checkout) | 64+ countries |

### Why MoonPay?

1. **Direct Stellar USDC Support**: Users can buy USDC on Stellar directly, not on another chain
2. **Memo Field**: Native support for memo tags, essential for routing payments
3. **Global Coverage**: 80+ countries, future-proofed for EU and global expansion
4. **Established Partner Ecosystem**: LOBSTR, and other Stellar wallets use MoonPay
5. **Robust Webhooks**: Real-time transaction notifications

### Alternative: Transak (if Lite KYC is priority)

Transak offers "Lite KYC" requiring only name and email (30-second onboarding) in select regions. If this becomes available for Stellar USDC, it could be preferable for the smoothest UX. Currently, XLM is confirmed; USDC on Stellar needs verification.

### Future Option: Coinbase Onramp

Coinbase's guest checkout ($500/week, no KYC for US users) is excellent, but currently doesn't appear to support Stellar as a destination network. Monitor for future Stellar support.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────────────┐
│  User    │───▶│ Ohloss       │───▶│  MoonPay    │───▶│ Proxy G-Address      │
│  (C-addr)│    │ Frontend     │    │  Widget     │    │ (with USDC trustline)│
└──────────┘    └──────────────┘    └─────────────┘    └──────────────────────┘
                      │                    │                      │
                      │                    │                      │
                      ▼                    ▼                      ▼
              Generate memo         Send USDC to            Webhook triggers
              = C-address           G-addr + memo           Cloudflare Worker
                                                                  │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE WORKER (PROXY SERVICE)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Receive MoonPay webhook                                                  │
│  2. Verify webhook signature                                                 │
│  3. Extract memo (= user's C-address)                                        │
│  4. Validate C-address format                                                │
│  5. Record transaction in D1 database                                        │
│  6. Forward USDC to C-address via SAC transfer                              │
│  7. Update database with completion status                                   │
│  8. Emit event/notification to user                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────┐
                        │  User's C-Address │
                        │  (receives USDC)  │
                        └───────────────────┘
```

---

## Detailed Flow

### 1. User Initiates Purchase

```typescript
// Frontend generates the MoonPay widget URL
const moonPayUrl = generateMoonPayUrl({
  apiKey: MOONPAY_API_KEY,
  currencyCode: 'usdc_xlm',  // USDC on Stellar
  walletAddress: PROXY_G_ADDRESS,  // Our proxy G-address
  walletAddressTag: userCAddress,  // User's C-address as memo
  baseCurrencyAmount: amount,
  baseCurrencyCode: 'usd',
});
```

### 2. MoonPay Processes Payment

- User completes KYC (if not already done)
- User pays with credit card
- MoonPay sends USDC on Stellar to `PROXY_G_ADDRESS` with memo `userCAddress`

### 3. Webhook Notification

MoonPay sends a webhook to our Cloudflare Worker:

```json
{
  "type": "transaction_completed",
  "data": {
    "id": "txn_abc123",
    "status": "completed",
    "cryptoTransactionId": "stellar_txn_hash",
    "walletAddress": "GPROXY...",
    "walletAddressTag": "CUSER123...",
    "quoteCurrencyAmount": "100.00",
    "quoteCurrencyCode": "usdc_xlm"
  }
}
```

### 4. Proxy Service Forwards USDC

```typescript
// Cloudflare Worker pseudo-code
async function handleWebhook(request: Request): Promise<Response> {
  // 1. Verify MoonPay signature
  const signature = request.headers.get('Moonpay-Signature');
  if (!verifySignature(signature, await request.text())) {
    return new Response('Invalid signature', { status: 401 });
  }

  const payload = await request.json();

  // 2. Extract and validate C-address from memo
  const cAddress = payload.data.walletAddressTag;
  if (!isValidCAddress(cAddress)) {
    // Store for manual review
    await storeFailedTransaction(payload, 'Invalid C-address');
    return new Response('Invalid address', { status: 400 });
  }

  // 3. Record pending transaction
  const txRecord = await db.insert({
    moonpay_txn_id: payload.data.id,
    stellar_txn_hash: payload.data.cryptoTransactionId,
    amount: payload.data.quoteCurrencyAmount,
    c_address: cAddress,
    status: 'pending_forward',
    created_at: new Date(),
  });

  // 4. Forward USDC via SAC
  try {
    const forwardTxn = await forwardUsdcToContract(cAddress, amount);

    // 5. Update status
    await db.update(txRecord.id, {
      status: 'completed',
      forward_txn_hash: forwardTxn.hash,
      completed_at: new Date(),
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    // 6. Handle failure - funds remain in proxy, queued for retry
    await db.update(txRecord.id, {
      status: 'forward_failed',
      error_message: error.message,
      retry_count: 0,
    });

    // Queue for retry
    await retryQueue.enqueue(txRecord.id);

    return new Response('Queued for retry', { status: 202 });
  }
}
```

---

## Technical Components

### 1. Proxy G-Address Setup

```bash
# Create a dedicated G-address for receiving onramp payments
stellar keys generate proxy-wallet --network mainnet

# Fund with XLM for transaction fees
# Establish USDC trustline
stellar contract invoke \
  --id USDC_CONTRACT_ID \
  --network mainnet \
  --source proxy-wallet \
  -- set_authorized \
  --id PROXY_G_ADDRESS \
  --authorize true
```

**Security Requirements:**
- Private key stored in Cloudflare Workers secrets (not in code)
- Multi-sig optional but recommended for higher volumes
- Regular key rotation policy

### 2. Cloudflare Worker Structure

```
api-worker/
├── src/
│   ├── index.ts              # Main router
│   ├── routes/
│   │   └── onramp.ts         # Webhook handler
│   ├── services/
│   │   ├── moonpay.ts        # MoonPay API client
│   │   ├── stellar.ts        # Stellar transaction builder
│   │   └── forwarder.ts      # USDC forwarding logic
│   ├── utils/
│   │   ├── validation.ts     # Address validation
│   │   └── signature.ts      # Webhook signature verification
│   └── db/
│       └── schema.ts         # D1 database schema
├── wrangler.toml
└── migrations/
    └── 0001_create_transactions.sql
```

### 3. Database Schema (Cloudflare D1)

```sql
CREATE TABLE onramp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moonpay_txn_id TEXT UNIQUE NOT NULL,
  stellar_inbound_hash TEXT,
  amount_usdc DECIMAL(18, 7) NOT NULL,
  c_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'received', 'forwarding', 'completed', 'failed', 'refunded'
  forward_txn_hash TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_status ON onramp_transactions(status);
CREATE INDEX idx_c_address ON onramp_transactions(c_address);
CREATE INDEX idx_created_at ON onramp_transactions(created_at);

-- Audit log for all state transitions
CREATE TABLE transaction_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  metadata TEXT,  -- JSON blob for additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES onramp_transactions(id)
);
```

### 4. SAC Transfer Implementation

```typescript
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Address
} from '@stellar/stellar-sdk';

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_CONTRACT = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'; // mainnet

async function forwardUsdcToContract(
  cAddress: string,
  amount: string
): Promise<{ hash: string }> {
  const server = new SorobanRpc.Server('https://soroban-rpc.stellar.org');

  // Load proxy account
  const proxyKeypair = Keypair.fromSecret(env.PROXY_SECRET_KEY);
  const proxyAccount = await server.getAccount(proxyKeypair.publicKey());

  // Build SAC transfer transaction
  const contract = new Contract(USDC_CONTRACT);

  const tx = new TransactionBuilder(proxyAccount, {
    fee: '100',
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      contract.call(
        'transfer',
        Address.fromString(proxyKeypair.publicKey()).toScVal(),  // from (G-address)
        Address.fromString(cAddress).toScVal(),                   // to (C-address)
        nativeToScVal(BigInt(parseUnits(amount, 7)), { type: 'i128' })  // amount
      )
    )
    .setTimeout(30)
    .build();

  // Simulate and submit
  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(proxyKeypair);

  const result = await server.sendTransaction(preparedTx);

  if (result.status === 'PENDING') {
    // Wait for confirmation
    const confirmed = await waitForConfirmation(server, result.hash);
    return { hash: confirmed.hash };
  }

  throw new Error(`Transaction failed: ${result.status}`);
}
```

---

## Failure Modes and Failsafes

### Failure Mode 1: MoonPay webhook fails to reach our server

**Risk**: User paid but we never know about it

**Failsafes**:
1. **Polling fallback**: Periodic job queries MoonPay API for recent transactions
2. **Horizon monitoring**: Watch proxy G-address for incoming USDC payments
3. **User dashboard**: Show pending transactions; allow manual claim trigger

```typescript
// Cron job every 5 minutes
async function pollMoonPayTransactions() {
  const recentTxns = await moonpay.getTransactions({
    walletAddress: PROXY_G_ADDRESS,
    status: 'completed',
    since: Date.now() - 30 * 60 * 1000,  // last 30 minutes
  });

  for (const txn of recentTxns) {
    const existing = await db.findByMoonPayId(txn.id);
    if (!existing) {
      // Webhook missed - process manually
      await processTransaction(txn);
    }
  }
}
```

### Failure Mode 2: Invalid C-address in memo

**Risk**: Funds stuck in proxy with no valid destination

**Failsafes**:
1. **Frontend validation**: Validate C-address format before generating MoonPay URL
2. **Webhook validation**: Check address format before attempting forward
3. **Manual review queue**: Store invalid transactions for admin review
4. **Refund path**: MoonPay supports refunds for failed transactions

```typescript
function isValidCAddress(address: string): boolean {
  // C-addresses start with 'C' and are 56 characters
  if (!address.startsWith('C') || address.length !== 56) {
    return false;
  }

  // Validate checksum
  try {
    Address.fromString(address);
    return true;
  } catch {
    return false;
  }
}
```

### Failure Mode 3: Forward transaction fails

**Risk**: Funds received but not forwarded to user

**Failsafes**:
1. **Automatic retry**: Exponential backoff retry (3 attempts over 1 hour)
2. **Alert system**: Notify admin after all retries exhausted
3. **Manual forward**: Admin dashboard to manually trigger forwards
4. **Funds never leave proxy**: User can always contact support for refund

```typescript
const RETRY_DELAYS = [60_000, 300_000, 900_000];  // 1min, 5min, 15min

async function processRetryQueue() {
  const failedTxns = await db.getFailedTransactions();

  for (const txn of failedTxns) {
    if (txn.retry_count >= RETRY_DELAYS.length) {
      // Max retries reached - alert admin
      await alertAdmin('Max retries reached', txn);
      continue;
    }

    const delayPassed = Date.now() - txn.updated_at > RETRY_DELAYS[txn.retry_count];
    if (!delayPassed) continue;

    try {
      await forwardUsdcToContract(txn.c_address, txn.amount_usdc);
      await db.update(txn.id, { status: 'completed' });
    } catch (error) {
      await db.update(txn.id, {
        retry_count: txn.retry_count + 1,
        error_message: error.message,
      });
    }
  }
}
```

### Failure Mode 4: Proxy account compromised

**Risk**: Attacker drains all funds from proxy

**Failsafes**:
1. **Minimum balance**: Keep only operational minimum in proxy
2. **Rate limiting**: Max forward amount per hour
3. **Multi-sig** (optional): Require 2-of-3 signatures for large amounts
4. **Monitoring**: Alert on unusual withdrawal patterns

### Failure Mode 5: User double-submits / duplicate webhooks

**Risk**: Forward same funds twice

**Failsafes**:
1. **Idempotency**: Use MoonPay transaction ID as unique key
2. **Database constraint**: UNIQUE constraint on `moonpay_txn_id`
3. **Status checks**: Only process transactions in 'pending' status

```typescript
async function handleWebhook(payload: MoonPayWebhook) {
  // Atomic idempotent insert
  const result = await db.run(`
    INSERT INTO onramp_transactions (moonpay_txn_id, amount_usdc, c_address, status)
    VALUES (?, ?, ?, 'received')
    ON CONFLICT (moonpay_txn_id) DO NOTHING
    RETURNING id
  `, [payload.data.id, payload.data.quoteCurrencyAmount, payload.data.walletAddressTag]);

  if (!result.lastRowId) {
    // Already processed
    return { alreadyProcessed: true };
  }

  // Continue processing...
}
```

---

## Security Considerations

### 1. Webhook Signature Verification

MoonPay signs webhooks with RSA. Always verify:

```typescript
import crypto from 'crypto';

function verifyMoonPaySignature(
  signature: string,
  payload: string,
  publicKey: string
): boolean {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payload);
  return verifier.verify(publicKey, signature, 'base64');
}
```

### 2. Secret Management

```toml
# wrangler.toml
[vars]
MOONPAY_API_KEY = "pk_live_xxx"  # Public key is OK in vars

# Secrets (set via `wrangler secret put`)
# PROXY_SECRET_KEY - Stellar signing key
# MOONPAY_WEBHOOK_SECRET - For signature verification
```

### 3. Rate Limiting

```typescript
// Per-user rate limiting
const RATE_LIMIT = {
  maxTransactionsPerHour: 5,
  maxAmountPerDay: 1000,  // USD
};

async function checkRateLimit(cAddress: string, amount: number): Promise<boolean> {
  const recentTxns = await db.getRecentTransactions(cAddress, '24 hours');

  const hourlyCount = recentTxns.filter(t =>
    Date.now() - t.created_at < 3600000
  ).length;

  const dailyTotal = recentTxns.reduce((sum, t) => sum + t.amount_usdc, 0);

  return hourlyCount < RATE_LIMIT.maxTransactionsPerHour
    && dailyTotal + amount < RATE_LIMIT.maxAmountPerDay;
}
```

### 4. Input Validation

- Validate all memo values as valid C-addresses
- Sanitize all database inputs
- Validate webhook payload structure
- Check amount bounds (min $20, max based on rate limits)

---

## Implementation Phases

### Phase 1: MVP (1-2 weeks)

- [ ] Set up MoonPay partner account
- [ ] Create proxy G-address with USDC trustline
- [ ] Implement basic Cloudflare Worker webhook handler
- [ ] D1 database with transaction tracking
- [ ] Basic SAC transfer implementation
- [ ] Frontend MoonPay widget integration
- [ ] Manual retry dashboard for admins

### Phase 2: Robustness (1-2 weeks)

- [ ] Webhook signature verification
- [ ] Automatic retry queue with exponential backoff
- [ ] Horizon polling fallback
- [ ] Rate limiting
- [ ] Error alerting (email/Discord)
- [ ] Transaction audit logging

### Phase 3: Polish (1 week)

- [ ] User-facing transaction status page
- [ ] Multiple onramp provider support (add Transak)
- [ ] Analytics dashboard
- [ ] Automated refund flow for failed transactions
- [ ] Load testing and optimization

---

## Cost Analysis

### MoonPay Fees
- **Transaction fee**: 4.5% (credit card)
- **Network fee**: ~0.00001 XLM (~free)
- **Minimum transaction**: $20

### Infrastructure Costs (Cloudflare)
- **Workers**: Free tier covers ~100K requests/day
- **D1 Database**: Free tier covers 5M reads/day, 100K writes/day
- **KV Storage**: Free tier covers 100K reads/day

### Operational Costs
- **Proxy account XLM**: ~10 XLM reserve + fees (~$1-2)
- **Monthly estimate**: <$50 for low volume

---

## Monitoring and Observability

### Key Metrics to Track

1. **Transaction success rate**: % of webhooks that result in successful forwards
2. **Average latency**: Time from webhook to forward completion
3. **Retry rate**: % of transactions requiring retries
4. **Failure rate**: % of transactions failing after all retries
5. **Total volume**: Daily/weekly/monthly USD volume

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Success rate | <95% | <90% |
| Latency (p95) | >30s | >60s |
| Failed transactions | >3/day | >10/day |
| Retry queue depth | >10 | >50 |

---

## Decisions Made

1. **Fee structure**: Pass fees to users transparently. MoonPay's 4.5% fee is shown to users during checkout - Ohloss does not subsidize.

2. **Multi-provider support**: MoonPay only for MVP. Transak can be added later if needed for Lite KYC or backup redundancy.

3. **Compliance**: MoonPay handles all KYC/AML as the licensed Money Service Business. Ohloss does not store user identity data - we only store transaction records with C-addresses.

4. **Refund flow**: For failed forwards where funds remain in proxy:
   - User contacts support with MoonPay transaction ID
   - Admin verifies the original purchase
   - Admin either retries forward to correct C-address OR initiates MoonPay refund
   - MoonPay refunds go back to original payment method

---

## References

- [MoonPay Developer Documentation](https://dev.moonpay.com/docs)
- [MoonPay Memo/Destination Tag Requirements](https://support.moonpay.com/customers/docs/destination-tag-memo)
- [Stellar Asset Contract (SAC) Documentation](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [Send to C-Accounts](https://developers.stellar.org/docs/build/guides/transactions/send-and-receive-c-accounts)
- [Coinbase Onramp Webhooks](https://docs.cdp.coinbase.com/onramp-&-offramp/webhooks)
- [Transak Lite KYC](https://transak.com/kyc)
- [Circle USDC on Stellar](https://www.circle.com/multi-chain-usdc/stellar)
