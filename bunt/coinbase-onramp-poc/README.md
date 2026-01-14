# Stellar USDC Onramp

Buy USDC on Stellar with credit card via Coinbase Onramp.

## Setup

1. Get credentials from [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)
2. Create `.env`:
   ```
   CDP_PROJECT_ID=your-project-id
   CDP_API_KEY=your-api-key
   CDP_API_SECRET=your-ed25519-private-key

   # Production: Set allowed origins (comma-separated)
   ALLOWED_ORIGINS=https://yourdomain.com
   ```
3. Run:
   ```bash
   bun install
   bun dev
   ```

Open http://localhost:3456

## API

### POST /api/onramp-url

Returns a Coinbase Onramp URL for Stellar USDC.

```json
{
  "address": "GABC...XYZ",
  "amount": 50,
  "partnerUserId": "user123"
}
```

### GET /api/transactions/:userId

Lookup transactions by partnerUserId.

## Security Requirements

Per [Coinbase Security Requirements](https://docs.cdp.coinbase.com/onramp-&-offramp/security-requirements):

| Requirement | Implementation |
|-------------|----------------|
| **CORS** | Restricted to `ALLOWED_ORIGINS` env var |
| **Secret API Key** | Server-side only, never exposed to client |
| **clientIp** | Uses CF-Connecting-IP (Cloudflare) or X-Real-IP (trusted proxy) |
| **Session Token** | 5-minute expiry, single use |
| **Address Validation** | Validates Stellar G-address format |

### Production Deployment

1. **Set ALLOWED_ORIGINS** - Restrict to your domain(s)
2. **Use a trusted proxy** - Deploy behind Cloudflare, AWS ALB, or nginx
3. **Configure IP allowlist** - In CDP Portal, restrict API key to your server IPs
4. **Enable sends** - Contact Coinbase support if "sends disabled" error appears

### Client IP Warning

The `clientIp` parameter prevents session token theft. In production:
- **Cloudflare**: Use `CF-Connecting-IP` header (trusted)
- **AWS ALB/nginx**: Use `X-Real-IP` from trusted proxy
- **Never trust** raw `X-Forwarded-For` from untrusted sources

## Notes

- **Guest checkout**: Up to $500/week, no Coinbase account needed
- **Addresses**: G-addresses only (M-addresses not supported)
- **Memos**: Prompted by Coinbase during checkout
- **Tracking**: Use `partnerUserId` → returned as `partner_user_ref` in transaction API
