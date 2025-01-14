import {
    Address,
    beginCell,
    Cell, CommonMessageInfoExternalIn,
    CommonMessageInfoInternal,
    Dictionary,
    Slice,
    Transaction,
    TransactionComputeVm,
    TupleReader
} from "@ton/core";
import {TransactionDescriptionGeneric} from "@ton/core/src/types/TransactionDescription";
import {formatCoinsPure} from "@ton/sandbox/dist/utils/printTransactionFees";

export const Opcodes = {
    initialize: 0xbe5a7595,
    withdraw: 0xcb03bfaf,
    deposit: 0xf9471134,
    extendStake: 0xeb666ce0,

    notifyReward: 0xa9577f0,
    changeDistributor: 0x27ee4c7d,
    claimRewards: 0xb30c7310,

    changeOwner: 0xf1eef33c,
    changeJettons: 0xeec15c2a,
    changePeriods: 0xfab30dc2,

    // for jettons
    mint: 21,
    internalTransfer: 0x178d4519,
    transfer: 0xf8a7ea5,

    burn: 0x595f07bc
};

export function safeAddress(reader: TupleReader) {
    try {
        return reader.readAddress()
    } catch (Error) {
        return null;
    }
}

export function safeAddressSlice(reader: Slice) {
    try {
        return reader.loadAddress()
    } catch (Error) {
        return null;
    }
}

export function safeParseDictBig(item: Cell | null) {
    if (item == null) {
        return null;
    }
    return Dictionary.loadDirect(Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell(),
        item);
}

export function safeParseDict(item: Cell | null) {
    if (item == null) {
        return null;
    }
    return Dictionary.loadDirect(Dictionary.Keys.Uint(32),
        Dictionary.Values.Cell(),
        item);
}

export function hashAddress(address: Address) {
    let x = beginCell().storeAddress(address).endCell().hash();
    return BigInt("0x" +x.toString('hex'))
}

function formatCoins(value: bigint, precision = 6) {
    if (value === undefined)
        return 'N/A';
    return formatCoinsPure(value, precision) + ' TON';
}

export function printTransactions(transactions: Transaction[]): void {
    console.table(transactions.map((tx) => {
        if (tx.description.type !== 'generic' || tx.inMessage === null) {
            return null;
        }
        const inMsg = tx.inMessage!.info;
        let from, to, opcode, valueIn;
        if (inMsg.type == 'external-in') {
            from = 'N/A';
            to = inMsg.dest.toRawString();
            opcode = 'N/A';
            valueIn = 'N/A';
        } else if (inMsg.type == 'internal') {
            from = inMsg.src.toRawString();
            to = inMsg.dest.toRawString();
            const body = tx.inMessage!.body.beginParse();
            opcode = body.remainingBits >= 32 ? body.preloadUint(32) : 'no body';
            valueIn = formatCoins(inMsg.value.coins);
        } else {
            return null;
        }
        const valueOut = formatCoins(
            tx.outMessages.values()
                .reduce((total, msg) => total + (msg.info.type === 'internal' ? msg.info.value.coins : 0n), 0n)
        );
        const totalFees = formatCoins(tx.totalFees.coins);
        const cp = tx.description.computePhase;
        let gasUsed, exitCode;
        if (cp.type == 'vm') {
            gasUsed = cp.gasUsed;
            exitCode = cp.exitCode;
        } else {
            gasUsed = exitCode = 'N/A';
        }
        return {
            from: from,
            to: to,
            opcode: typeof opcode === 'number' ? ('0x' + opcode.toString(16)) : opcode,
            value_in: valueIn,
            value_out: valueOut,
            total_fees: totalFees,
            gas_used: gasUsed,
            exit_code: exitCode,
            out_actions: tx.description.actionPhase?.totalActions ?? 'N/A'
        };
    }));
}

export function getTransactionAccount(tx: Transaction): Address | null {
    if (tx.inMessage === null) {
        return null
    }
    const info = tx.inMessage!.info;
    if (info.type === 'external-in') {
        return info.dest;
    } else if (info.type === 'internal') {
        return info.dest;
    } else {
        return null;
    }
}