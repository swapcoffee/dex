import {
    Address,
    beginCell,
    Cell,
    Contract, contractAddress,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';


export class TestContract2 implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new TestContract2(address);
    }

    static createFromConfig(a: number, code: Cell) {
        const data = beginCell().storeUint(a, 32).endCell();
        const init = {code, data};
        return new TestContract2(contractAddress(0, init), init);
    }

    async sendSmth(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint,
            opcode: number,
            queryId: number
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(opts.opcode, 32)
                .storeUint(opts.queryId, 64)
                .endCell(),
        });
    }

}