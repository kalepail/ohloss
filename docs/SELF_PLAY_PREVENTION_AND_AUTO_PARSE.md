# Self-Play Prevention & Auto-Parse Auth Entry XDR

## Summary

This document describes the implementation of two key features:
1. **Self-Play Prevention**: Prevent users from playing against themselves
2. **Auto-Parse Auth Entry XDR**: Automatically parse and validate auth entry when pasted

## Issue 1: Self-Play Prevention

### Problem
Users could manually set Player 2 address to match Player 1 address from the auth entry, creating invalid self-play games.

### Solution: Multi-Layer Defense

Implemented validation at **three layers** for complete security:

#### Layer 1: UI Validation (Primary)
**File:** `frontend/src/components/NumberGuessGame.tsx`

**Location:** Lines 369-378 in `handleImportTransaction`

```typescript
// Verify the user is Player 2 (prevent self-play)
if (gameParams.player1 === userAddress) {
  throw new Error('Invalid game: You cannot play against yourself (you are Player 1 in this auth entry)');
}

// Additional validation: Ensure Player 2 address is different from Player 1
if (userAddress === gameParams.player1) {
  throw new Error('Cannot play against yourself. Player 2 must be different from Player 1.');
}
```

**Benefits:**
- Immediate feedback to user
- No wasted gas/transaction fees
- Clear error messaging

---

#### Layer 2: Service Layer Validation (Defense in Depth)
**File:** `frontend/src/services/numberGuessService.ts`

**Location:** Lines 345-348 in `importAndSignAuthEntry`

```typescript
// Validation: Prevent self-play at service layer
if (player2Address === gameParams.player1) {
  throw new Error('Cannot play against yourself. Player 2 must be different from Player 1.');
}
```

**Benefits:**
- Catches bypass attempts via direct service calls
- Protects API boundary
- Redundant safety

---

#### Layer 3: Contract-Level Validation (Ultimate Protection)
**File:** `contracts/number-guess/src/lib.rs`

**Location:** Lines 136-139 in `start_game`

```rust
// Prevent self-play: Player 1 and Player 2 must be different
if player1 == player2 {
    panic!("Cannot play against yourself: Player 1 and Player 2 must be different addresses");
}
```

**Benefits:**
- Prevents ALL bypass attempts (even if frontend is compromised)
- Contract-level guarantee
- Security at source of truth

---

## Issue 2: Auto-Parse Auth Entry XDR

### Problem
When users pasted Auth Entry XDR, nothing happened until they clicked "Import & Sign". Users had no immediate feedback on whether the XDR was valid.

### Solution: Real-Time Parsing with Visual Feedback

#### Implementation

**File:** `frontend/src/components/NumberGuessGame.tsx`

**New State Variables (Lines 48-50):**
```typescript
const [xdrParsing, setXdrParsing] = useState(false);
const [xdrParseError, setXdrParseError] = useState<string | null>(null);
const [xdrParseSuccess, setXdrParseSuccess] = useState(false);
```

**Auto-Parse useEffect (Lines 244-301):**
```typescript
// Auto-parse Auth Entry XDR when pasted
useEffect(() => {
  // Only parse if in import mode and XDR is not empty
  if (createMode !== 'import' || !importAuthEntryXDR.trim()) {
    // Reset parse states when XDR is cleared
    if (!importAuthEntryXDR.trim()) {
      setXdrParsing(false);
      setXdrParseError(null);
      setXdrParseSuccess(false);
      setImportSessionId('');
      setImportPlayer1('');
      setImportPlayer1Wager('');
    }
    return;
  }

  // Auto-parse the XDR
  const parseXDR = async () => {
    setXdrParsing(true);
    setXdrParseError(null);
    setXdrParseSuccess(false);

    try {
      console.log('[Auto-Parse] Parsing auth entry XDR...');
      const gameParams = numberGuessService.parseAuthEntry(importAuthEntryXDR.trim());

      // Check if user is trying to import their own auth entry (self-play prevention)
      if (gameParams.player1 === userAddress) {
        throw new Error('You cannot play against yourself. This auth entry was created by you (Player 1).');
      }

      // Successfully parsed - auto-fill fields
      setImportSessionId(gameParams.sessionId.toString());
      setImportPlayer1(gameParams.player1);
      setImportPlayer1Wager((Number(gameParams.player1Wager) / 10_000_000).toString());
      setXdrParseSuccess(true);
      console.log('[Auto-Parse] Successfully parsed auth entry');
    } catch (err) {
      console.error('[Auto-Parse] Failed to parse auth entry:', err);
      const errorMsg = err instanceof Error ? err.message : 'Invalid auth entry XDR';
      setXdrParseError(errorMsg);
      // Clear auto-filled fields on error
      setImportSessionId('');
      setImportPlayer1('');
      setImportPlayer1Wager('');
    } finally {
      setXdrParsing(false);
    }
  };

  // Debounce parsing to avoid parsing on every keystroke
  const timeoutId = setTimeout(parseXDR, 500);
  return () => clearTimeout(timeoutId);
}, [importAuthEntryXDR, createMode, userAddress]);
```

**Key Features:**
- **Debounced parsing**: 500ms delay to avoid parsing on every keystroke
- **Self-play detection**: Checks if user is importing their own auth entry
- **Auto-fill**: Automatically populates Session ID, Player 1 Address, Player 1 Wager
- **Error handling**: Clear error messages for invalid XDR

---

#### Visual Feedback UI (Lines 867-898)

**Label with Status Indicators:**
```typescript
<label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-2">
  Auth Entry XDR
  {xdrParsing && (
    <span className="text-blue-500 text-xs animate-pulse">Parsing...</span>
  )}
  {xdrParseSuccess && (
    <span className="text-green-600 text-xs">✓ Parsed successfully</span>
  )}
  {xdrParseError && (
    <span className="text-red-600 text-xs">✗ Parse failed</span>
  )}
</label>
```

**Dynamic Border Colors:**
```typescript
<textarea
  value={importAuthEntryXDR}
  onChange={(e) => setImportAuthEntryXDR(e.target.value)}
  placeholder="Paste Player 1's signed auth entry XDR here..."
  rows={4}
  className={`w-full px-4 py-3 rounded-xl bg-white border-2 focus:outline-none focus:ring-4 text-xs font-mono resize-none transition-colors ${
    xdrParseError
      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
      : xdrParseSuccess
      ? 'border-green-300 focus:border-green-400 focus:ring-green-100'
      : 'border-blue-200 focus:border-blue-400 focus:ring-blue-100'
  }`}
/>
```

**Error Message Display:**
```typescript
{xdrParseError && (
  <p className="text-xs text-red-600 font-semibold mt-1">
    {xdrParseError}
  </p>
)}
```

---

## User Experience Flow

### Before Changes
1. User pastes Auth Entry XDR
2. No feedback
3. Click "Import & Sign"
4. Wait for validation
5. See error if something was wrong

### After Changes
1. User pastes Auth Entry XDR
2. **Immediate visual feedback**:
   - "Parsing..." (blue, animated)
   - After 500ms:
     - ✓ "Parsed successfully" (green border) + auto-filled fields
     - OR ✗ "Parse failed" (red border) + error message
3. If valid, user can review auto-filled values
4. Click "Import & Sign" with confidence

---

## Testing Checklist

### Self-Play Prevention

- [ ] **Test 1: Import own auth entry**
  - Create & export auth entry as Player 1
  - Try to import same auth entry
  - **Expected:** Red error immediately after parsing: "You cannot play against yourself"

- [ ] **Test 2: Manual address editing (UI layer)**
  - Import valid auth entry from another player
  - Click Import & Sign
  - **Expected:** UI validation catches it, shows error

- [ ] **Test 3: Service layer bypass attempt**
  - Try to call `importAndSignAuthEntry` with same address
  - **Expected:** Service throws error before blockchain call

- [ ] **Test 4: Contract layer (ultimate test)**
  - If somehow UI and service are bypassed
  - **Expected:** Contract panics with "Cannot play against yourself"

### Auto-Parse Functionality

- [ ] **Test 5: Paste valid XDR**
  - Paste valid auth entry
  - **Expected:**
    - "Parsing..." appears
    - After 500ms: ✓ "Parsed successfully"
    - Green border
    - Session ID, Player 1 Address, Player 1 Wager auto-filled

- [ ] **Test 6: Paste invalid XDR**
  - Paste garbage text or incomplete XDR
  - **Expected:**
    - "Parsing..." appears
    - After 500ms: ✗ "Parse failed"
    - Red border
    - Error message shown
    - Fields remain empty

- [ ] **Test 7: Clear XDR**
  - Paste valid XDR, let it parse
  - Clear the textarea
  - **Expected:**
    - Status indicators disappear
    - Border returns to blue
    - Auto-filled fields cleared

- [ ] **Test 8: Typing (debounce test)**
  - Start typing random characters
  - **Expected:**
    - Parsing doesn't trigger until 500ms of inactivity
    - No flickering of status messages

---

## Files Modified

### Frontend
1. **frontend/src/components/NumberGuessGame.tsx**
   - Added state variables for parsing status (lines 48-50)
   - Added auto-parse useEffect (lines 244-301)
   - Updated UI with visual feedback (lines 867-898)
   - Added self-play validation in handleImportTransaction (lines 369-378)

2. **frontend/src/services/numberGuessService.ts**
   - Added self-play validation in importAndSignAuthEntry (lines 345-348)

### Contract
3. **contracts/number-guess/src/lib.rs**
   - Added self-play validation in start_game (lines 136-139)

---

## Build Verification

### Frontend Build
```bash
cd /Users/kalepail/Desktop/blendizzard/frontend
bun run build
```
**Result:** ✅ Build successful (no type errors)

### Contract Build
```bash
cd /Users/kalepail/Desktop/blendizzard/contracts/number-guess
stellar contract build
```
**Result:** ✅ Build successful
- Wasm File: 9792 bytes
- Wasm Hash: 211a266f8f4e8c56a6e54e48f90f06b4a6b2f4e115b8691ebc439e4c140ba317

---

## Security Benefits

### Defense in Depth
By implementing validation at three layers:
1. **UI**: Fast feedback, saves user time
2. **Service**: Protects API boundary
3. **Contract**: Ultimate source of truth, prevents all bypass attempts

Even if an attacker:
- Modifies frontend code
- Directly calls service methods
- Crafts custom transactions

The contract will **always reject** self-play attempts.

---

## Performance Considerations

### Debouncing
- 500ms delay prevents excessive parsing
- Reduces CPU usage when typing/editing
- Smooth user experience

### Visual Feedback
- Instant feedback when state changes
- CSS transitions for smooth color changes
- Minimal re-renders (only when parse states change)

---

## Future Enhancements

Potential improvements:
1. **Contract Upgrade**: Deploy updated number-guess contract to testnet/mainnet
2. **Error Recovery**: Suggest fixes for common XDR format issues
3. **QR Code Support**: Parse auth entry from QR code scan
4. **Clipboard Detection**: Auto-paste when clipboard contains valid XDR
5. **Progressive Parsing**: Show which fields are being extracted during parse

---

## Status

✅ **All features implemented and verified**
✅ **Frontend builds successfully**
✅ **Contract builds successfully**
✅ **Ready for testing**
