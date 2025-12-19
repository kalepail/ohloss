/**
 * Set admin when transferring from one C-address (Ohloss contract) to another C-address
 *
 * Both the old and new admin are Ohloss contracts that implement __check_auth.
 * Their __check_auth delegates to a G-address admin which needs to sign the payload.
 *
 * The signature_payload is computed as hash(HashIdPreimageSorobanAuthorization(...))
 * based on the Ohloss contract's auth entry (nonce, expiration, invocation).
 */

import {
    Address,
    Keypair,
    Networks,
    Operation,
    TransactionBuilder,
    xdr,
    hash,
} from "@stellar/stellar-sdk";
import { DEFAULT_TIMEOUT } from "@stellar/stellar-sdk/contract";
import { Api, assembleTransaction, Server } from "@stellar/stellar-sdk/rpc";

// Contract addresses
const feeVaultID = 'CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y';
const oldOhlossID = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';
const newOhlossID = 'CBOM2KGQDK4TMTIULH2UJWNLWEIXG47IM2RND4UDGM7KK5EQUQDFOVAY';

const networkPassphrase = Networks.PUBLIC;

// Validate required environment variables
if (!process.env.RPC_URL || !process.env.ADMIN_SECRET) {
    throw new Error('Missing required environment variables. Please check your .env file.');
}

const rpc = new Server(process.env.RPC_URL);
const keypair = Keypair.fromSecret(process.env.ADMIN_SECRET);
const pubkey = keypair.publicKey(); // GD2GA2JF6OJURU36COZQWJLPEJ7XC3GB25TBD7U4ALCGKOG27262RICH

console.log('=== Set Admin C-to-C Transfer ===\n');
console.log('Fee Vault:', feeVaultID);
console.log('Old Admin (Ohloss):', oldOhlossID);
console.log('New Admin (Ohloss):', newOhlossID);
console.log('Underlying Admin (G-address):', pubkey);
console.log();

// Build the transaction
const acct = await rpc.getAccount(pubkey);
const tx = new TransactionBuilder(acct, {
    fee: (100_000).toString(),
    networkPassphrase
})
.addOperation(Operation.invokeContractFunction({
    contract: feeVaultID,
    function: 'set_admin',
    args: [
        Address.fromString(newOhlossID).toScVal(),
    ]
}))
.setTimeout(0)
.build();

console.log('Step 1: Initial simulation...');
const simBefore = await rpc.simulateTransaction(tx);

if (Api.isSimulationError(simBefore)) {
    console.error('Simulation error:', simBefore);
    process.exit(1);
}

if (!simBefore.result || !simBefore.result.auth) {
    console.error('No auth entries in simulation result');
    process.exit(1);
}

console.log(`Found ${simBefore.result.auth.length} auth entries\n`);

// Get latest ledger for signature expiration
const lastLedger = await rpc.getLatestLedger().then(({ sequence }) => sequence);
const expirationLedger = lastLedger + DEFAULT_TIMEOUT;

// Network ID for computing signature payloads
const networkId = hash(Buffer.from(networkPassphrase));

console.log('Step 2: Processing auth entries and computing signature payloads...');
console.log('Latest ledger:', lastLedger);
console.log('Expiration ledger:', expirationLedger);
console.log();

// Process each auth entry
const op = tx.operations[0] as Operation.InvokeHostFunction;

// Store modified entries and their computed signature payloads
const modifiedEntries: { entry: xdr.SorobanAuthorizationEntry, signaturePayload: Buffer, ohlossAddress: string }[] = [];

for (let i = 0; i < simBefore.result.auth.length; i++) {
    const entry = simBefore.result.auth[i];
    const entryClone = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());

    try {
        const credentials = entryClone.credentials();
        const credType = credentials.switch().name;

        if (credType === 'sorobanCredentialsAddress') {
            const addressCreds = credentials.address();
            const entryAddress = Address.fromScAddress(addressCreds.address()).toString();

            // Check if this is one of the Ohloss contracts
            if (entryAddress === oldOhlossID || entryAddress === newOhlossID) {
                console.log(`Processing Ohloss auth entry for ${entryAddress}...`);

                // Set signature expiration and void signature
                addressCreds.signatureExpirationLedger(expirationLedger);
                addressCreds.signature(xdr.ScVal.scvVoid());

                // Create __check_auth invocation with empty args for the sub-invocation
                const checkAuthInvocation = new xdr.InvokeContractArgs({
                    contractAddress: Address.fromString(entryAddress).toScAddress(),
                    functionName: "__check_auth",
                    args: [],
                });

                // Add __check_auth as sub-invocation
                entryClone.rootInvocation().subInvocations().push(
                    new xdr.SorobanAuthorizedInvocation({
                        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(checkAuthInvocation),
                        subInvocations: [],
                    })
                );

                console.log('  Added __check_auth sub-invocation');

                // Compute the signature payload for this Ohloss contract's auth
                // This is what __check_auth will call require_auth_for_args with
                const authPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
                    new xdr.HashIdPreimageSorobanAuthorization({
                        networkId: networkId,
                        nonce: addressCreds.nonce(),
                        signatureExpirationLedger: expirationLedger,
                        invocation: entryClone.rootInvocation(),
                    })
                );
                const signaturePayload = hash(authPreimage.toXDR());

                console.log(`  Computed signature payload: ${signaturePayload.toString('hex').substring(0, 16)}...`);

                modifiedEntries.push({ entry: entryClone, signaturePayload, ohlossAddress: entryAddress });
            }
        }
    } catch (err: any) {
        console.error(`Error processing auth entry ${i}:`, err.message);
    }

    // Update the auth entry in the operation
    if (op.auth) {
        op.auth[i] = entryClone;
    }
}

// Create source account auth entries with the computed signature payloads
console.log('\nStep 3: Creating source account auth entries with signature payloads...');

for (const { signaturePayload, ohlossAddress } of modifiedEntries) {
    // The source account entry authorizes: "G-address authorizes require_auth_for_args([signaturePayload]) from __check_auth"
    const delegatedInvocation = new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(ohlossAddress).toScAddress(),
        functionName: "__check_auth",
        args: [xdr.ScVal.scvBytes(signaturePayload)], // The signature_payload that require_auth_for_args is called with
    });

    const sourceAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
        rootInvocation: new xdr.SorobanAuthorizedInvocation({
            function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(delegatedInvocation),
            subInvocations: [],
        }),
    });

    op.auth?.push(sourceAuthEntry);
    console.log(`  Added source account auth entry for ${ohlossAddress}`);
}

console.log(`\nTotal auth entries: ${op.auth?.length}`);

// Re-simulate
console.log('\nStep 4: Re-simulating with correct auth entries...');

const rawSim = await rpc._simulateTransaction(tx);
console.log('Raw simulation result:');
if (rawSim.error) {
    console.log('Error:', rawSim.error.substring(0, 1000));
}

const simAfter = await rpc.simulateTransaction(tx);

if (Api.isSimulationError(simAfter)) {
    console.error('\nRe-simulation failed!');
    console.error('Full error:', simAfter.error);
    process.exit(1);
}

console.log('\nRe-simulation successful!');

// Assemble and sign
console.log('\nStep 5: Assembling and signing transaction...');
const txAssembled = assembleTransaction(tx, simAfter).build();

txAssembled.sign(keypair);

console.log('Transaction signed');
console.log('Transaction XDR:', txAssembled.toXDR().substring(0, 200) + '...');
console.log();

// Send the transaction
console.log('Step 6: Sending transaction...');
const sendRes = await rpc.sendTransaction(txAssembled);
console.log('Send result:', sendRes.status, sendRes.hash);

if (sendRes.status === 'ERROR') {
    console.error('Send error:', sendRes.errorResult);
    process.exit(1);
}

// Poll for result
console.log('\nStep 7: Polling for result...');
const pollRes = await rpc.pollTransaction(sendRes.hash);

if (pollRes.status === 'SUCCESS') {
    console.log('\n✅ SUCCESS!');
    console.log('Transaction hash:', pollRes.txHash);

    // Verify the new admin
    console.log('\nVerifying new admin...');
    const { execSync } = require('child_process');
    try {
        const newAdmin = execSync(`stellar contract invoke --id ${feeVaultID} --network mainnet --source-account ${process.env.ADMIN_SECRET} -- get_admin`, { encoding: 'utf-8' });
        console.log('New admin:', newAdmin.trim());
    } catch (err: any) {
        console.log('Could not verify:', err.message);
    }
} else if (pollRes.status === 'NOT_FOUND') {
    console.log('\n⚠️ Transaction not found');
    console.log(pollRes);
} else {
    console.log('\n❌ FAILED');
    console.log('Envelope XDR:', pollRes.envelopeXdr.toXDR('base64'));
    console.log('\nResult XDR:', pollRes.resultXdr.toXDR('base64'));

    // Try to decode the result
    console.log('\nDecoding result...');
    try {
        const resultXdr = pollRes.resultXdr.toXDR('base64');
        const { execSync } = require('child_process');
        const decoded = execSync(`stellar xdr decode --type TransactionResult --output json-formatted <<< '${resultXdr}'`, { encoding: 'utf-8', shell: '/bin/bash' });
        console.log(decoded);
    } catch (err: any) {
        console.log('Could not decode:', err.message);
    }
}
