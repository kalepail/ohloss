# Ohloss API Worker

Cloudflare Worker that proxies requests to external APIs, keeping secrets server-side.

## Purpose

Securely proxy Soroswap API requests without exposing the API key to clients.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/swap/quote` | POST | Get XLM→USDC swap quote from Soroswap |

## Quick Start

```bash
# Install dependencies
bun install

# Copy secrets file
cp .dev.vars.example .dev.vars
# Add your SOROSWAP_API_KEY

# Run locally
bunx wrangler dev

# Deploy
bunx wrangler deploy
```

## Configuration

### Local Development (`.dev.vars`)

```bash
SOROSWAP_API_KEY=sk_your_api_key_here
```

### Production

Set secrets via Cloudflare dashboard or CLI:

```bash
bunx wrangler secret put SOROSWAP_API_KEY
```

## API Usage

### Get Swap Quote

```bash
curl -X POST http://localhost:8787/api/swap/quote \
  -H "Content-Type: application/json" \
  -d '{"amountIn": "10000000", "slippageBps": 500}'
```

**Request:**
- `amountIn` (required): XLM amount in stroops (7 decimals)
- `slippageBps` (optional): Slippage tolerance in basis points (default: 500 = 5%)

**Response:** Soroswap quote with routing information

## Related

- `frontend-v2/` - Main app that calls this API
