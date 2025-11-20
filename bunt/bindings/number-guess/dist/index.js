import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk';
export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';
if (typeof window !== 'undefined') {
    //@ts-ignore Buffer exists
    window.Buffer = window.Buffer || Buffer;
}
export const Errors = {
    1: { message: "GameNotFound" },
    2: { message: "NotPlayer" },
    3: { message: "AlreadyGuessed" },
    4: { message: "BothPlayersNotGuessed" },
    5: { message: "GameAlreadyEnded" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, blendizzard }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, blendizzard }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAIAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADXBsYXllcjFfZ3Vlc3MAAAAAAAPoAAAABAAAAAAAAAANcGxheWVyMV93YWdlcgAAAAAAAAsAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAANcGxheWVyMl9ndWVzcwAAAAAAA+gAAAAEAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEwAAAAAAAAAOd2lubmluZ19udW1iZXIAAAAAA+gAAAAE",
            "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAOQWxyZWFkeUd1ZXNzZWQAAAAAAAMAAAAAAAAAFUJvdGhQbGF5ZXJzTm90R3Vlc3NlZAAAAAAAAAQAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAF",
            "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAAEkJsZW5kaXp6YXJkQWRkcmVzcwAAAAAAAAAAAAAAAAAFQWRtaW4AAAA=",
            "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
            "AAAAAAAAAJ1HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyB3aW5uaW5nIG51bWJlciBhZnRlciBnYW1lIGVuZHMpAAAAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
            "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
            "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
            "AAAAAAAAAOJNYWtlIGEgZ3Vlc3MgZm9yIHRoZSBjdXJyZW50IGdhbWUuClBsYXllcnMgY2FuIGd1ZXNzIGEgbnVtYmVyIGJldHdlZW4gMSBhbmQgMTAuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCiogYHBsYXllcmAgLSBBZGRyZXNzIG9mIHRoZSBwbGF5ZXIgbWFraW5nIHRoZSBndWVzcwoqIGBndWVzc2AgLSBUaGUgZ3Vlc3NlZCBudW1iZXIgKDEtMTApAAAAAAAKbWFrZV9ndWVzcwAAAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAVndWVzcwAAAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
            "AAAAAAAAAhlTdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBGUCB3YWdlcnMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gQmxlbmRpenphcmQgYW5kIGxvY2tzIEZQIGJlZm9yZSBzdGFydGluZyB0aGUgZ2FtZS4KCioqQ1JJVElDQUw6KiogVGhpcyBtZXRob2QgcmVxdWlyZXMgYXV0aG9yaXphdGlvbiBmcm9tIFRISVMgY29udHJhY3QgKG5vdCBwbGF5ZXJzKS4KQmxlbmRpenphcmQgd2lsbCBjYWxsIGBnYW1lX2lkLnJlcXVpcmVfYXV0aCgpYCB3aGljaCBjaGVja3MgdGhpcyBjb250cmFjdCdzIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKHUzMikKKiBgcGxheWVyMWAgLSBBZGRyZXNzIG9mIGZpcnN0IHBsYXllcgoqIGBwbGF5ZXIyYCAtIEFkZHJlc3Mgb2Ygc2Vjb25kIHBsYXllcgoqIGBwbGF5ZXIxX3dhZ2VyYCAtIEZQIGFtb3VudCBwbGF5ZXIxIGlzIHdhZ2VyaW5nCiogYHBsYXllcjJfd2FnZXJgIC0gRlAgYW1vdW50IHBsYXllcjIgaXMgd2FnZXJpbmcAAAAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
            "AAAAAAAAAK5Jbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEJsZW5kaXp6YXJkIGFkZHJlc3MgYW5kIGFkbWluCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBBZG1pbiBhZGRyZXNzIChjYW4gdXBncmFkZSBjb250cmFjdCkKKiBgYmxlbmRpenphcmRgIC0gQWRkcmVzcyBvZiB0aGUgQmxlbmRpenphcmQgY29udHJhY3QAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtibGVuZGl6emFyZAAAAAATAAAAAA==",
            "AAAAAAAAAT9SZXZlYWwgdGhlIHdpbm5lciBvZiB0aGUgZ2FtZSBhbmQgc3VibWl0IG91dGNvbWUgdG8gQmxlbmRpenphcmQuCkNhbiBvbmx5IGJlIGNhbGxlZCBhZnRlciBib3RoIHBsYXllcnMgaGF2ZSBtYWRlIHRoZWlyIGd1ZXNzZXMuClRoaXMgZ2VuZXJhdGVzIHRoZSB3aW5uaW5nIG51bWJlciwgZGV0ZXJtaW5lcyB0aGUgd2lubmVyLCBhbmQgZW5kcyB0aGUgc2Vzc2lvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIEFkZHJlc3Mgb2YgdGhlIHdpbm5pbmcgcGxheWVyAAAAAA1yZXZlYWxfd2lubmVyAAAAAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAAEwAAAAM=",
            "AAAAAAAAAGZHZXQgdGhlIGN1cnJlbnQgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIEJsZW5kaXp6YXJkIGNvbnRyYWN0IGFkZHJlc3MAAAAAAA9nZXRfYmxlbmRpenphcmQAAAAAAAAAAAEAAAAT",
            "AAAAAAAAAG5TZXQgYSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2JsZW5kaXp6YXJkYCAtIFRoZSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwAAAAAAD3NldF9ibGVuZGl6emFyZAAAAAABAAAAAAAAAA9uZXdfYmxlbmRpenphcmQAAAAAEwAAAAA="]), options);
        this.options = options;
    }
    fromJSON = {
        upgrade: (this.txFromJSON),
        get_game: (this.txFromJSON),
        get_admin: (this.txFromJSON),
        set_admin: (this.txFromJSON),
        make_guess: (this.txFromJSON),
        start_game: (this.txFromJSON),
        reveal_winner: (this.txFromJSON),
        get_blendizzard: (this.txFromJSON),
        set_blendizzard: (this.txFromJSON)
    };
}
