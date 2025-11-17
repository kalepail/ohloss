# Blendizzard Frontend TODO

**Project**: Faction-based competitive gaming protocol on Stellar Soroban
**Stack**: React 19 + TypeScript + Vite + Tailwind CSS + Stellar SDK
**Target**: November 2025 best practices

---

## Phase 1: Project Setup & Configuration

### 1.1 Dependencies Installation
- [ ] Install core dependencies
  ```bash
  # Core libraries
  bun add @stellar/stellar-sdk
  bun add @creit.tech/stellar-wallets-kit
  bun add zustand @tanstack/react-query
  bun add react-router-dom

  # UI & Styling
  bun add tailwindcss postcss autoprefixer
  bun add clsx tailwind-merge
  bun add @headlessui/react
  bun add lucide-react

  # Utilities
  bun add bignumber.js
  bun add date-fns
  ```

- [ ] Install dev dependencies
  ```bash
  bun add -D @types/bignumber.js
  bun add -D prettier prettier-plugin-tailwindcss
  ```

### 1.2 Configuration Files
- [ ] Configure Tailwind CSS with macOS-style design system
  - Enable dark mode
  - Set up custom color palette (faction colors)
  - Add glassmorphism utilities
  - Configure responsive breakpoints

- [ ] Set up environment variables
  ```env
  VITE_NETWORK=testnet
  VITE_RPC_URL=https://soroban-testnet.stellar.org
  VITE_HORIZON_URL=https://horizon-testnet.stellar.org
  VITE_BLENDIZZARD_CONTRACT=C...
  VITE_GAME_CONTRACT=C...
  VITE_VAULT_CONTRACT=C...
  VITE_USDC_TOKEN=C...
  VITE_BLND_TOKEN=C...
  ```

- [ ] Create TypeScript path aliases in vite.config.ts
  - @/components
  - @/hooks
  - @/services
  - @/store
  - @/types
  - @/utils

### 1.3 Project Structure Setup
- [ ] Create directory structure (as defined in research)
- [ ] Set up base layout components
- [ ] Configure React Router with protected routes
- [ ] Set up error boundaries

---

## Phase 2: Contract Integration Layer

### 2.1 Type Generation
- [ ] Generate TypeScript bindings for Blendizzard contract
  ```bash
  stellar contract bindings typescript \
    --wasm ../target/wasm32v1-none/release/blendizzard.wasm \
    --output-dir ./src/types/contracts/blendizzard \
    --contract-id $BLENDIZZARD_CONTRACT_ID \
    --network testnet
  ```

- [ ] Generate TypeScript bindings for NumberGuess contract
  ```bash
  stellar contract bindings typescript \
    --wasm ../target/wasm32v1-none/release/number_guess.wasm \
    --output-dir ./src/types/contracts/number-guess \
    --contract-id $GAME_CONTRACT_ID \
    --network testnet
  ```

- [ ] Create manual type definitions for fee-vault-v2
  - deposit(user: Address, amount: i128) -> i128
  - withdraw(user: Address, amount: i128) -> i128
  - get_underlying_tokens(user: Address) -> i128
  - get_shares(user: Address) -> i128

### 2.2 Soroban Client Service
- [ ] Create `services/sorobanClient.ts`
  - Initialize SorobanRpc.Server
  - Configure network passphrase
  - Set up retry logic with exponential backoff
  - Add request timeout handling

- [ ] Create `services/contractService.ts`
  - Wrapper for contract invocations
  - Transaction building utilities
  - Simulation before submission
  - Fee estimation
  - Multi-sig transaction assembly
  - Error handling and mapping

### 2.3 Contract-Specific Services

#### 2.3.1 Blendizzard Contract Service
- [ ] `services/blendizzardService.ts`
  - **Read Methods**:
    - `getCurrentEpoch(): Promise<number>`
    - `getEpoch(epochNum: number): Promise<EpochInfo>`
    - `getPlayer(address: string): Promise<Player>`
    - `getEpochPlayer(epoch: number, address: string): Promise<EpochPlayer>`
    - `getConfig(): Promise<Config>`
    - `isGame(gameAddress: string): Promise<boolean>`

  - **Write Methods**:
    - `selectFaction(player: string, faction: 0 | 1 | 2): Promise<TxHash>`
    - `claimEpochReward(player: string, epoch: number): Promise<TxHash>`

  - **Admin Methods** (if admin wallet connected):
    - `addGame(gameAddress: string): Promise<TxHash>`
    - `cycleEpoch(): Promise<TxHash>`

#### 2.3.2 Fee Vault Service
- [ ] `services/vaultService.ts`
  - **Read Methods**:
    - `getUnderlyingTokens(user: string): Promise<bigint>`
    - `getShares(user: string): Promise<bigint>`

  - **Write Methods**:
    - `deposit(user: string, amount: bigint): Promise<TxHash>`
    - `withdraw(user: string, amount: bigint): Promise<TxHash>`

#### 2.3.3 Number Guess Game Service
- [ ] `services/gameService.ts`
  - **Read Methods**:
    - `getGame(sessionId: number): Promise<Game>`
    - `getBlendizzardAddress(): Promise<string>`

  - **Write Methods** (multi-sig required):
    - `startGame(sessionId: number, player1: string, player2: string, wager1: bigint, wager2: bigint): Promise<TxHash>`
    - `makeGuess(sessionId: number, player: string, guess: number): Promise<TxHash>`
    - `revealWinner(sessionId: number): Promise<TxHash>`

### 2.4 Multi-Signature Support
- [ ] Create `services/multiSigService.ts`
  - Transaction pool for pending multi-sig TXs
  - Signature collection logic
  - Threshold validation
  - Expiry handling (10 min timeout)
  - Transaction assembly with multiple signatures

---

## Phase 3: State Management

### 3.1 Zustand Stores

#### 3.1.1 Wallet Store
- [ ] `store/walletSlice.ts`
  - State:
    - `publicKey: string | null`
    - `isConnected: boolean`
    - `walletType: 'freighter' | 'xbull' | null`
    - `network: 'testnet' | 'mainnet'`
  - Actions:
    - `connect()`
    - `disconnect()`
    - `switchNetwork()`

#### 3.1.2 Vault Store
- [ ] `store/vaultSlice.ts`
  - State:
    - `balance: bigint`
    - `shares: bigint`
    - `depositHistory: Transaction[]`
    - `withdrawalHistory: Transaction[]`
    - `pendingTxs: Map<string, TxStatus>`
  - Actions:
    - `updateBalance()`
    - `addPendingDeposit()`
    - `confirmDeposit()`
    - `addPendingWithdrawal()`
    - `confirmWithdrawal()`

#### 3.1.3 Game Store
- [ ] `store/gameSlice.ts`
  - State:
    - `currentGame: Game | null`
    - `gameHistory: Game[]`
    - `pendingGuess: number | null`
    - `isWaitingForOpponent: boolean`
  - Actions:
    - `createGame()`
    - `submitGuess()`
    - `revealWinner()`
    - `resetGame()`

#### 3.1.4 Blendizzard Store
- [ ] `store/blendizzardSlice.ts`
  - State:
    - `currentEpoch: number`
    - `epochInfo: EpochInfo | null`
    - `player: Player | null`
    - `epochPlayer: EpochPlayer | null`
    - `selectedFaction: 0 | 1 | 2 | null`
    - `factionLocked: boolean`
  - Actions:
    - `loadEpochData()`
    - `loadPlayerData()`
    - `selectFaction()`
    - `claimReward()`

#### 3.1.5 UI Store
- [ ] `store/uiSlice.ts`
  - State:
    - `sidebarOpen: boolean`
    - `activeModal: string | null`
    - `notifications: Notification[]`
    - `theme: 'light' | 'dark'`
  - Actions:
    - `toggleSidebar()`
    - `openModal()`
    - `closeModal()`
    - `addNotification()`
    - `dismissNotification()`

### 3.2 React Query Setup
- [ ] Configure QueryClient in `App.tsx`
  - Set default stale time (5 seconds)
  - Enable refetch on window focus
  - Configure retry logic

- [ ] Create query hooks:
  - `useEpochQuery()`
  - `usePlayerQuery()`
  - `useVaultBalanceQuery()`
  - `useGameQuery()`

---

## Phase 4: Wallet Integration

### 4.1 Wallet Connection
- [ ] Create `services/walletService.ts`
  - Initialize StellarWalletsKit
  - Configure Freighter module
  - Handle wallet connection flow
  - Manage wallet state persistence

- [ ] Create `hooks/useWallet.ts`
  - Expose wallet connection methods
  - Handle network switching
  - Manage connected state
  - Auto-reconnect on page load

### 4.2 Wallet UI Components
- [ ] `components/wallet/WalletConnect.tsx`
  - Connect button with loading states
  - Wallet selection modal
  - Error handling display

- [ ] `components/wallet/WalletStatus.tsx`
  - Display connected wallet address (truncated)
  - Show network indicator
  - Balance display (USDC, BLND)
  - Disconnect button

- [ ] `components/wallet/NetworkSwitcher.tsx`
  - Toggle between testnet/mainnet
  - Show current network with visual indicator

---

## Phase 5: Core Feature Components

### 5.1 Vault Management

#### 5.1.1 Deposit Flow
- [ ] `components/vault/DepositForm.tsx`
  - Amount input with validation
  - Max button (deposit all available USDC)
  - Display current USDC balance
  - Show estimated shares to receive
  - Submit button with loading state
  - Transaction status feedback

- [ ] `components/vault/DepositSuccess.tsx`
  - Success message with TX hash
  - Display updated balance
  - Link to view on Stellar Expert
  - Option to deposit more or return

#### 5.1.2 Withdrawal Flow
- [ ] `components/vault/WithdrawalForm.tsx`
  - Amount input with validation
  - Max button (withdraw all shares)
  - Display current shares balance
  - Show estimated USDC to receive
  - Warning about >50% withdrawal resetting time multiplier
  - Submit button with loading state
  - Transaction status feedback

- [ ] `components/vault/VaultBalance.tsx`
  - Display total deposited (USDC equivalent)
  - Show shares owned
  - Display time held (for multiplier calculation)
  - Show current multipliers (amount + time)

### 5.2 Faction Selection

- [ ] `components/faction/FactionSelector.tsx`
  - Three faction cards: WholeNoodle, PointyStick, SpecialRock
  - Display faction colors and icons
  - Show current faction selection
  - Highlight locked state during epoch
  - Disable selection if faction locked
  - Confirmation modal before switching

- [ ] `components/faction/FactionStandings.tsx`
  - Display current epoch standings
  - Show total FP per faction
  - Animate changes in real-time
  - Highlight winning faction

### 5.3 Game Interface

#### 5.3.1 Game Creation (Multi-Sig)
- [ ] `components/game/GameCreator.tsx`
  - Player 1 address input
  - Player 2 address input
  - Wager amount inputs (FP)
  - Session ID generation
  - Multi-sig signer selection
  - Create game button
  - Display pending signatures
  - Transaction status

#### 5.3.2 Game Play
- [ ] `components/game/GameBoard.tsx`
  - Display game session info
  - Show player addresses and wagers
  - Number input (1-10)
  - Submit guess button
  - Waiting for opponent indicator
  - Reveal winner button (after both guessed)

- [ ] `components/game/GameResult.tsx`
  - Display winning number
  - Show player guesses
  - Display distances from winning number
  - Announce winner
  - Show FP won/lost
  - Link to play again

- [ ] `components/game/GameHistory.tsx`
  - List past games
  - Show outcomes (win/loss)
  - Display FP changes
  - Filter by date/faction

### 5.4 Epoch & Rewards

- [ ] `components/epoch/EpochDisplay.tsx`
  - Current epoch number
  - Time remaining in epoch (countdown)
  - Current faction standings
  - Total reward pool (USDC)

- [ ] `components/epoch/EpochHistory.tsx`
  - List past epochs
  - Show winners per epoch
  - Display reward distribution
  - Filter/search functionality

- [ ] `components/rewards/RewardClaim.tsx`
  - Display claimable rewards per epoch
  - Claim button for each epoch
  - Total rewards earned display
  - Transaction status feedback

---

## Phase 6: Dashboard & Navigation

### 6.1 Main Dashboard
- [ ] `components/dashboard/Dashboard.tsx`
  - Overview cards:
    - Total deposited (vault)
    - Available FP
    - Current faction
    - Epoch countdown
  - Quick actions:
    - Deposit
    - Play game
    - Claim rewards
  - Recent activity feed

### 6.2 Navigation
- [ ] `components/layout/Navbar.tsx`
  - Logo/branding
  - Navigation links (Vault, Game, Rewards, Admin)
  - WalletStatus component
  - Theme toggle (dark/light)

- [ ] `components/layout/Sidebar.tsx` (mobile)
  - Slide-out navigation
  - Same links as Navbar
  - User profile section

- [ ] `components/layout/Footer.tsx`
  - Links to docs
  - GitHub repo
  - Network status indicator

### 6.3 Routing
- [ ] Set up React Router routes:
  - `/` - Dashboard
  - `/vault` - Vault management (deposit/withdraw)
  - `/game` - Game interface
  - `/game/create` - Create game (multi-sig)
  - `/rewards` - Epoch history & rewards
  - `/admin` - Admin panel (cycle epoch, add games)

---

## Phase 7: UI/UX Polish

### 7.1 Design System
- [ ] Create `styles/design-tokens.css`
  - Define color palette (faction colors)
  - Set up spacing scale
  - Configure typography
  - Add glassmorphism utilities

- [ ] Implement faction color themes:
  - WholeNoodle: Blue tones
  - PointyStick: Red/orange tones
  - SpecialRock: Green/earth tones

### 7.2 Loading States
- [ ] `components/common/LoadingSpinner.tsx`
- [ ] `components/common/Skeleton.tsx`
- [ ] Add loading states to all async components

### 7.3 Error Handling
- [ ] `components/common/ErrorBoundary.tsx`
- [ ] `components/common/ErrorDisplay.tsx`
- [ ] Map Soroban error codes to user-friendly messages

### 7.4 Notifications
- [ ] `components/common/Notification.tsx`
  - Success notifications
  - Error notifications
  - Info notifications
  - Auto-dismiss after 5s

- [ ] `components/common/NotificationCenter.tsx`
  - Stack notifications
  - Dismiss all button

### 7.5 Animations
- [ ] Add transition animations for:
  - Route changes
  - Modal open/close
  - Faction selection
  - Number reveal in game
  - FP changes

### 7.6 Responsive Design
- [ ] Test on mobile (375px)
- [ ] Test on tablet (768px)
- [ ] Test on desktop (1440px+)
- [ ] Ensure touch-friendly targets (min 44px)

---

## Phase 8: Advanced Features

### 8.1 Real-Time Updates
- [ ] Implement WebSocket connection for:
  - Balance changes
  - Game state updates
  - Epoch cycling
  - Faction standings

- [ ] Create `hooks/useRealtimeBalance.ts`
- [ ] Create `hooks/useRealtimeGame.ts`

### 8.2 Transaction History
- [ ] `components/history/TransactionList.tsx`
  - Display all user transactions
  - Filter by type (deposit, withdraw, game, claim)
  - Sort by date
  - Link to Stellar Expert

### 8.3 Analytics
- [ ] `components/analytics/PlayerStats.tsx`
  - Total games played
  - Win/loss ratio
  - Total FP earned
  - Average wager
  - Favorite faction

### 8.4 Admin Panel
- [ ] `components/admin/AdminPanel.tsx` (protected route)
  - Cycle epoch button
  - Add/remove game contracts
  - View contract config
  - Emergency pause (future)

---

## Phase 9: Testing & Optimization

### 9.1 Testing
- [ ] Set up Vitest for unit tests
- [ ] Test critical user flows:
  - Wallet connection
  - Deposit/withdraw
  - Faction selection
  - Game play
  - Reward claiming

- [ ] Test multi-sig flow with multiple wallets
- [ ] Test error scenarios (insufficient balance, network errors)

### 9.2 Performance Optimization
- [ ] Implement code splitting with React.lazy()
- [ ] Optimize bundle size:
  - Remove unused dependencies
  - Tree-shake Stellar SDK
  - Use dynamic imports

- [ ] Add React.memo() to expensive components
- [ ] Optimize re-renders with proper state structure

### 9.3 Accessibility
- [ ] Add ARIA labels
- [ ] Ensure keyboard navigation
- [ ] Test with screen reader
- [ ] Check color contrast ratios

---

## Phase 10: Deployment

### 10.1 Build Configuration
- [ ] Configure Vite for production build
- [ ] Set up environment variables for production
- [ ] Optimize assets (images, fonts)

### 10.2 Deployment
- [ ] Choose hosting (Vercel, Netlify, Cloudflare Pages)
- [ ] Set up CI/CD pipeline
- [ ] Configure custom domain
- [ ] Enable HTTPS

### 10.3 Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Add analytics (Plausible, Fathom)
- [ ] Monitor performance (Web Vitals)

---

## Phase 11: Documentation

- [ ] Write user guide
  - How to connect wallet
  - How to deposit/withdraw
  - How to select faction
  - How to play game
  - How to claim rewards

- [ ] Write developer docs
  - Architecture overview
  - Component documentation
  - Service layer docs
  - Deployment guide

- [ ] Create demo video

---

## Implementation Priority

### Week 1-2: Foundation
1. Project setup & dependencies ✓
2. Contract type generation ✓
3. Wallet integration ✓
4. Basic routing & layout ✓

### Week 3-4: Core Features
5. Vault deposit/withdraw ✓
6. Faction selection ✓
7. Player data display ✓
8. Epoch countdown ✓

### Week 5-6: Game Features
9. Game creation (multi-sig) ✓
10. Game play interface ✓
11. Game history ✓
12. Reward claiming ✓

### Week 7-8: Polish & Deploy
13. UI/UX refinement ✓
14. Testing ✓
15. Performance optimization ✓
16. Deployment ✓

---

## Design Guidelines (macOS Style)

### Colors
- Use subtle gradients
- Prefer soft shadows over hard borders
- Apply backdrop-blur for glass effect
- Use semi-transparent overlays

### Typography
- System font stack: SF Pro, Inter, system-ui
- Clear hierarchy (48px heading, 16px body)
- Comfortable line height (1.6)

### Spacing
- Consistent 8px grid
- Generous whitespace
- Padding: 16px (mobile), 24px (desktop)

### Interactive Elements
- Subtle hover states (opacity, scale)
- Smooth transitions (200ms ease)
- Clear focus indicators
- Touch-friendly sizes (min 44px)

### Dark Mode
- Dark gray background (#1a1a1a)
- White text (#ffffff)
- Reduced contrast for comfort
- Accent colors remain vibrant

---

## Technical Constraints

1. **Multi-Sig Requirement**: Game creation requires 2+ signers
2. **Cross-Epoch Logic**: FP calculated once per epoch at first game
3. **Direct Vault Interaction**: Users interact with fee-vault-v2 directly (not through Blendizzard)
4. **Time Multiplier Reset**: >50% withdrawal between epochs resets time to 0
5. **Faction Locking**: Faction locks on first game of epoch
6. **Epoch Duration**: 4 days (345,600 seconds)
7. **USDC Decimals**: 7 decimals on Stellar (not 6)

---

## Key Contract Addresses (Testnet)

_To be populated during deployment_

```
BLENDIZZARD_CONTRACT=C...
GAME_CONTRACT=C...
VAULT_CONTRACT=C...
USDC_TOKEN=C...
BLND_TOKEN=C...
```

---

## Notes

- Use Bun for all package management and scripts
- Follow React 19 best practices (use hooks, avoid class components)
- Keep components small and focused (single responsibility)
- Use TypeScript strictly (no `any` types)
- Prefer composition over inheritance
- Use Tailwind utility classes (avoid custom CSS when possible)
- Optimize for mobile-first, then scale up
- Test on real devices, not just browser DevTools

---

## Resources

- [Stellar Soroban Docs](https://soroban.stellar.org)
- [Stellar SDK Docs](https://stellar.github.io/js-stellar-sdk/)
- [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)
- [Fee Vault v2 Repo](https://github.com/script3/fee-vault-v2)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [React Query Docs](https://tanstack.com/query)
- [Zustand Docs](https://zustand-demo.pmnd.rs)
