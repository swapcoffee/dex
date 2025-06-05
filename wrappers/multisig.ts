import {
    Address,
    beginCell,
    Cell,
    Dictionary,
    internal,
    MessageRelaxed,
    SenderArguments,
    SendMode,
    storeMessageRelaxed,
    toNano
} from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { getSecureRandomBytes } from '@ton/crypto';

export type TransferRequest = { sendMode: SendMode; message: MessageRelaxed };

export async function proposeMultisigMessages(
    provider: NetworkProvider,
    multisigAddress: Address,
    args: SenderArguments | SenderArguments[],
    value: bigint = toNano(.05),
    timeout: number = 3600
) {
    const sender = provider.sender()
    if (!sender.address) {
        throw new Error('sender address required')
    }
    args = Array.isArray(args) ? args : [args]
    const argToTransferRequest = (arg: SenderArguments): TransferRequest => {
        return {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            message: internal(arg)
        }
    }
    const generateOrderSeqno = async (): Promise<bigint> => {
        const buffer = await getSecureRandomBytes(64)
        return buffer.readBigUInt64BE(0)
    }
    const { stack } = await provider.provider(multisigAddress).get('get_multisig_data', [])
    const nextOrderSeqno = stack.readBigNumber()
    const threshold = stack.readBigNumber()
    const signers = cellToArray(stack.readCellOpt())
    const proposers = cellToArray(stack.readCellOpt())

    const orderSeqno = nextOrderSeqno == -1n ? await generateOrderSeqno() : nextOrderSeqno
    const deadline = Math.floor(Date.now() / 1000) + timeout

    const addrCmp = (x: Address) => x.equals(sender.address!)
    let isSigner: boolean
    let addressIndex = signers.findIndex(addrCmp)
    if (addressIndex >= 0) {
        isSigner = true
    } else {
        addressIndex = proposers.findIndex(addrCmp)
        if (addressIndex >= 0) {
            isSigner = false
        } else {
            throw new Error('Only signers or proposers may propose orders to multisig')
        }
    }

    const actions = args.map(argToTransferRequest)
    const packedActions = actions.length > 255 ? packLarge(actions, multisigAddress) : packOrder(actions)
    await sender.send({
        to: multisigAddress,
        body: beginCell()
            .storeUint(0xf718510f, 32)
            .storeUint(0, 64)
            .storeUint(orderSeqno, 256)
            .storeBit(isSigner)
            .storeUint(addressIndex, 8)
            .storeUint(deadline, 48)
            .storeRef(packedActions)
            .endCell(),
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
    })
}

function packLarge(actions: Array<TransferRequest>, address: Address): Cell {
    const packChained = function (req: Cell): TransferRequest {
        return {
            sendMode: 1,
            message: internal({
                to: address,
                value: toNano('0.01'),
                body: beginCell()
                    .storeUint(0xa32c59bf, 32)
                    .storeUint(0, 64)
                    .storeRef(req)
                    .endCell()
            })
        }
    }
    let tailChunk: Cell | null = null
    let chunkCount = Math.ceil(actions.length / 254)
    let actionProcessed = 0
    let lastSz = actions.length % 254
    while (chunkCount--) {
        let chunkSize: number;
        if (lastSz > 0) {
            chunkSize = lastSz
            lastSz = 0
        } else {
            chunkSize = 254
        }
        // Processing chunks from tail to head to evade recursion
        const chunk = actions.slice(-(chunkSize + actionProcessed), actions.length - actionProcessed)
        if (tailChunk === null) {
            tailChunk = packOrder(chunk)
        } else {
            // Every next chunk has to be chained with execute_internal
            tailChunk = packOrder([...chunk, packChained(tailChunk)])
        }
        actionProcessed += chunkSize
    }
    if (tailChunk === null) {
        throw new Error('Something went wrong during large order pack')
    }
    return tailChunk
}

function packOrder(actions: Array<TransferRequest>) {
    const order_dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell())
    if (actions.length > 255) {
        throw new Error('For action chains above 255, use packLarge method')
    } else {
        // pack transfers to the order_body cell
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i]
            const actionCell = packTransferRequest(action)
            order_dict.set(i, actionCell)
        }
        return beginCell()
            .storeDictDirect(order_dict)
            .endCell()
    }
}

function packTransferRequest(transfer: TransferRequest) {
    const message = beginCell().store(storeMessageRelaxed(transfer.message)).endCell()
    return beginCell()
        .storeUint(0xf1381e5b, 32)
        .storeUint(transfer.sendMode, 8)
        .storeRef(message)
        .endCell()
}

function cellToArray(addrDict: Cell | null): Array<Address> {
    let resArr: Array<Address> = []
    if (addrDict !== null) {
        const dict = Dictionary.loadDirect(
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Address(),
            addrDict
        )
        resArr = dict.values()
    }
    return resArr
}