import {
    Address,
    beginCell,
    Cell,
    Contract,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';


export class TestContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new TestContract(address);
    }

    async sendSmth(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint,
            opcode: number,
            queryId: number
            gas: number
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(opts.opcode, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.gas, 32)
                .endCell(),
        });
    }

    async getStoredData(provider: ContractProvider) {
        const result = await provider.get('get_stored_data', []);
        return result.stack.readCell()
    }
}