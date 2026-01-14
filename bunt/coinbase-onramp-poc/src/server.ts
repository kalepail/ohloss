import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

const app = new Hono();

// Security: Restrict CORS to approved origins only (add your production domain)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3456'];
app.use('/*', cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type'],
}));

const { CDP_API_KEY = '', CDP_API_SECRET = '', CDP_PROJECT_ID = '' } = process.env;
const ONRAMP_URL = 'https://pay.coinbase.com/buy/select-asset';

// Validate Stellar G-address format (basic validation)
function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

// Security: Get client IP from request (for production, use a trusted proxy or require IP from client)
// WARNING: X-Forwarded-For can be spoofed - in production, only trust this from a known proxy
async function getClientIp(c: { req: { header: (name: string) => string | undefined } }): Promise<string> {
  // In production behind a trusted proxy (Cloudflare, AWS ALB, etc.), use their verified header
  // CF-Connecting-IP (Cloudflare), X-Real-IP (nginx), or connection.remoteAddress
  const cfIp = c.req.header('cf-connecting-ip'); // Cloudflare
  const realIp = c.req.header('x-real-ip'); // Trusted proxy

  // For local dev, fetch public IP
  if (!cfIp && !realIp) {
    const res = await fetch('https://api.ipify.org?format=json');
    return ((await res.json()) as { ip: string }).ip;
  }

  return cfIp || realIp || '0.0.0.0';
}

async function createSessionToken(address: string, clientIp: string): Promise<string> {
  const jwt = await generateJwt({
    apiKeyId: CDP_API_KEY,
    apiKeySecret: CDP_API_SECRET,
    requestMethod: 'POST',
    requestHost: 'api.developer.coinbase.com',
    requestPath: '/onramp/v1/token',
    expiresIn: 120,
  });

  const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      addresses: [{ address, blockchains: ['stellar'] }],
      assets: ['USDC'],
      clientIp,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return ((await response.json()) as { token: string }).token;
}

// API: Create session and return full onramp URL
app.post('/api/onramp-url', async (c) => {
  try {
    const { address, amount, partnerUserId } = await c.req.json();

    if (!isValidStellarAddress(address)) {
      return c.json({ error: 'Invalid Stellar G-address format' }, 400);
    }

    const clientIp = await getClientIp(c);
    const sessionToken = await createSessionToken(address, clientIp);

    const params = new URLSearchParams({
      sessionToken,
      defaultAsset: 'USDC',
      defaultNetwork: 'stellar',
      defaultPaymentMethod: 'APPLE_PAY',
      presetFiatAmount: String(amount || 5),
      fiatCurrency: 'USD',
    });

    if (partnerUserId) {
      params.set('partnerUserId', partnerUserId);
    }

    return c.json({ url: `${ONRAMP_URL}?${params}` });
  } catch (error) {
    console.error('Onramp error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get transactions by partnerUserId
app.get('/api/transactions/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const path = `/onramp/v1/buy/user/${encodeURIComponent(userId)}/transactions`;

    const jwt = await generateJwt({
      apiKeyId: CDP_API_KEY,
      apiKeySecret: CDP_API_SECRET,
      requestMethod: 'GET',
      requestHost: 'api.developer.coinbase.com',
      requestPath: path,
      expiresIn: 120,
    });

    const response = await fetch(`https://api.developer.coinbase.com${path}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return c.json(await response.json());
  } catch (error) {
    console.error('Transactions error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Health check
app.get('/api/health', (c) => c.json({
  ok: Boolean(CDP_API_KEY && CDP_API_SECRET && CDP_PROJECT_ID),
}));

// UI
app.get('/', (c) => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Buy USDC on Stellar</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6 text-center">Buy USDC on Stellar</h1>

    <div class="bg-gray-800 rounded-xl p-6 space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Stellar Address</label>
        <input type="text" id="address" placeholder="G..."
          class="w-full px-4 py-3 bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div>
        <label class="block text-sm text-gray-400 mb-1">Amount (USD)</label>
        <input type="number" id="amount" value="5" min="5" max="500"
          class="w-full px-4 py-3 bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        <p class="text-xs text-gray-500 mt-1">Guest limit: $500/week, no account needed</p>
      </div>

      <div>
        <label class="block text-sm text-gray-400 mb-1">User ID (optional)</label>
        <input type="text" id="userId" placeholder="For tracking" maxlength="50"
          class="w-full px-4 py-3 bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <button onclick="buy()" id="buyBtn"
        class="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">
        Buy USDC
      </button>

      <p id="error" class="text-red-400 text-sm hidden"></p>
    </div>

    <div class="bg-gray-800 rounded-xl p-6 mt-4">
      <div class="flex gap-2">
        <input type="text" id="lookupId" placeholder="User ID to lookup"
          class="flex-1 px-4 py-3 bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        <button onclick="lookup()" id="lookupBtn"
          class="px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold transition-colors">
          Lookup
        </button>
      </div>
      <div id="transactions" class="mt-4 hidden">
        <div id="txList" class="space-y-2 text-sm"></div>
      </div>
    </div>

    <div class="mt-6 text-xs text-gray-500 text-center space-y-1">
      <p>Powered by Coinbase Onramp</p>
      <p>G-addresses only | Memos handled at checkout</p>
    </div>
  </div>

  <script>
    async function buy() {
      const btn = document.getElementById('buyBtn');
      const error = document.getElementById('error');
      const address = document.getElementById('address').value.trim();
      const amount = document.getElementById('amount').value;
      const partnerUserId = document.getElementById('userId').value.trim();

      if (!/^G[A-Z2-7]{55}$/.test(address)) {
        error.textContent = 'Enter a valid Stellar G-address (56 characters starting with G)';
        error.classList.remove('hidden');
        return;
      }

      error.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Loading...';

      try {
        const res = await fetch('/api/onramp-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, amount: Number(amount), partnerUserId }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        window.open(data.url, 'coinbase', 'width=460,height=700,left=' + (screen.width/2-230) + ',top=' + (screen.height/2-350));
      } catch (e) {
        error.textContent = e.message;
        error.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Buy USDC';
      }
    }
    async function lookup() {
      const btn = document.getElementById('lookupBtn');
      const userId = document.getElementById('lookupId').value.trim();
      const txDiv = document.getElementById('transactions');
      const txList = document.getElementById('txList');

      if (!userId) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        const res = await fetch('/api/transactions/' + encodeURIComponent(userId));
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const txs = data.transactions || [];
        if (txs.length === 0) {
          txList.innerHTML = '<p class="text-gray-400">No transactions found</p>';
        } else {
          txList.innerHTML = txs.map(tx => {
            const status = tx.status?.replace('ONRAMP_TRANSACTION_STATUS_', '') || 'UNKNOWN';
            const color = status === 'SUCCESS' ? 'text-green-400' : status === 'IN_PROGRESS' ? 'text-yellow-400' : 'text-gray-400';
            const amount = tx.purchase_amount?.value || tx.purchaseAmount?.value || '?';
            const currency = tx.purchase_currency || tx.purchaseCurrency || '';
            return '<div class="bg-gray-700 rounded p-3 flex justify-between">' +
              '<span>' + amount + ' ' + currency + '</span>' +
              '<span class="' + color + '">' + status + '</span>' +
            '</div>';
          }).join('');
        }
        txDiv.classList.remove('hidden');
      } catch (e) {
        txList.innerHTML = '<p class="text-red-400">' + e.message + '</p>';
        txDiv.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lookup';
      }
    }
  </script>
</body>
</html>`));

const port = Number(process.env.PORT) || 3456;
console.log(`Stellar USDC Onramp running on http://localhost:${port}`);

export default { port, fetch: app.fetch };
