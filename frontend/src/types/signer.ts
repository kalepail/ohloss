import { contract } from '@stellar/stellar-sdk';

/**
 * Standard signer type for all contract interactions
 * Use this type when passing signers to service methods
 */
export type ContractSigner = Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>;
