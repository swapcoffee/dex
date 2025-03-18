import {Address, Cell, Contract, ContractProvider, Sender, SendMode} from '@ton/core';

export abstract class Pool implements Contract {
    protected constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body
        });
    }

    async getPoolData(provider: ContractProvider) {
        let res = await provider.get("get_pool_data", []);
        return {
            v: res.stack.readNumber(),
            asset1: res.stack.readCell(),
            asset2: res.stack.readCell(),
            amm: res.stack.readBigNumber(),
            ammSettings: res.stack.readCellOpt(),
            isActive: res.stack.readBigNumber(),
            reserve1: res.stack.readBigNumber(),
            reserve2: res.stack.readBigNumber(),
            totalSupply: res.stack.readBigNumber(),
            protocolFee: res.stack.readBigNumber(),
            lpFee: res.stack.readBigNumber()
        }
    }
}
