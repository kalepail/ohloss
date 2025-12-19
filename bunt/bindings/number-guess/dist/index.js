import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
if (typeof window !== "undefined") {
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
    { admin, ohloss }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, ohloss }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAIAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADXBsYXllcjFfZ3Vlc3MAAAAAAAPoAAAABAAAAAAAAAANcGxheWVyMV93YWdlcgAAAAAAAAsAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAANcGxheWVyMl9ndWVzcwAAAAAAA+gAAAAEAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEwAAAAAAAAAOd2lubmluZ19udW1iZXIAAAAAA+gAAAAE",
            "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAOQWxyZWFkeUd1ZXNzZWQAAAAAAAMAAAAAAAAAFUJvdGhQbGF5ZXJzTm90R3Vlc3NlZAAAAAAAAAQAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAF",
            "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADU9obG9zc0FkZHJlc3MAAAAAAAAAAAAAAAAAAAVBZG1pbgAAAA==",
            "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
            "AAAAAAAAAJ1HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyB3aW5uaW5nIG51bWJlciBhZnRlciBnYW1lIGVuZHMpAAAAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
            "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
            "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
            "AAAAAAAAAFxHZXQgdGhlIGN1cnJlbnQgT2hsb3NzIGNvbnRyYWN0IGFkZHJlc3MKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIFRoZSBPaGxvc3MgY29udHJhY3QgYWRkcmVzcwAAAApnZXRfb2hsb3NzAAAAAAAAAAAAAQAAABM=",
            "AAAAAAAAAOJNYWtlIGEgZ3Vlc3MgZm9yIHRoZSBjdXJyZW50IGdhbWUuClBsYXllcnMgY2FuIGd1ZXNzIGEgbnVtYmVyIGJldHdlZW4gMSBhbmQgMTAuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCiogYHBsYXllcmAgLSBBZGRyZXNzIG9mIHRoZSBwbGF5ZXIgbWFraW5nIHRoZSBndWVzcwoqIGBndWVzc2AgLSBUaGUgZ3Vlc3NlZCBudW1iZXIgKDEtMTApAAAAAAAKbWFrZV9ndWVzcwAAAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAVndWVzcwAAAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
            "AAAAAAAAAF9TZXQgYSBuZXcgT2hsb3NzIGNvbnRyYWN0IGFkZHJlc3MKCiMgQXJndW1lbnRzCiogYG5ld19vaGxvc3NgIC0gVGhlIG5ldyBPaGxvc3MgY29udHJhY3QgYWRkcmVzcwAAAAAKc2V0X29obG9zcwAAAAAAAQAAAAAAAAAKbmV3X29obG9zcwAAAAAAEwAAAAA=",
            "AAAAAAAAAg9TdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBGUCB3YWdlcnMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gT2hsb3NzIGFuZCBsb2NrcyBGUCBiZWZvcmUgc3RhcnRpbmcgdGhlIGdhbWUuCgoqKkNSSVRJQ0FMOioqIFRoaXMgbWV0aG9kIHJlcXVpcmVzIGF1dGhvcml6YXRpb24gZnJvbSBUSElTIGNvbnRyYWN0IChub3QgcGxheWVycykuCk9obG9zcyB3aWxsIGNhbGwgYGdhbWVfaWQucmVxdWlyZV9hdXRoKClgIHdoaWNoIGNoZWNrcyB0aGlzIGNvbnRyYWN0J3MgYWRkcmVzcy4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVW5pcXVlIHNlc3Npb24gaWRlbnRpZmllciAodTMyKQoqIGBwbGF5ZXIxYCAtIEFkZHJlc3Mgb2YgZmlyc3QgcGxheWVyCiogYHBsYXllcjJgIC0gQWRkcmVzcyBvZiBzZWNvbmQgcGxheWVyCiogYHBsYXllcjFfd2FnZXJgIC0gRlAgYW1vdW50IHBsYXllcjEgaXMgd2FnZXJpbmcKKiBgcGxheWVyMl93YWdlcmAgLSBGUCBhbW91bnQgcGxheWVyMiBpcyB3YWdlcmluZwAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
            "AAAAAAAAAJ9Jbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIE9obG9zcyBhZGRyZXNzIGFuZCBhZG1pbgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRtaW4gYWRkcmVzcyAoY2FuIHVwZ3JhZGUgY29udHJhY3QpCiogYG9obG9zc2AgLSBBZGRyZXNzIG9mIHRoZSBPaGxvc3MgY29udHJhY3QAAAAADV9fY29uc3RydWN0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABm9obG9zcwAAAAAAEwAAAAA=",
            "AAAAAAAAATpSZXZlYWwgdGhlIHdpbm5lciBvZiB0aGUgZ2FtZSBhbmQgc3VibWl0IG91dGNvbWUgdG8gT2hsb3NzLgpDYW4gb25seSBiZSBjYWxsZWQgYWZ0ZXIgYm90aCBwbGF5ZXJzIGhhdmUgbWFkZSB0aGVpciBndWVzc2VzLgpUaGlzIGdlbmVyYXRlcyB0aGUgd2lubmluZyBudW1iZXIsIGRldGVybWluZXMgdGhlIHdpbm5lciwgYW5kIGVuZHMgdGhlIHNlc3Npb24uCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCgojIFJldHVybnMKKiBgQWRkcmVzc2AgLSBBZGRyZXNzIG9mIHRoZSB3aW5uaW5nIHBsYXllcgAAAAAADXJldmVhbF93aW5uZXIAAAAAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAATAAAAAw=="]), options);
        this.options = options;
    }
    fromJSON = {
        upgrade: (this.txFromJSON),
        get_game: (this.txFromJSON),
        get_admin: (this.txFromJSON),
        set_admin: (this.txFromJSON),
        get_ohloss: (this.txFromJSON),
        make_guess: (this.txFromJSON),
        set_ohloss: (this.txFromJSON),
        start_game: (this.txFromJSON),
        reveal_winner: (this.txFromJSON)
    };
}
