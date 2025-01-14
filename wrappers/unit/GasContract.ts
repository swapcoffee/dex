import {
    Address,
    beginCell,
    Cell,
    Contract, contractAddress,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';
import {buildDataCell} from "../Factory";


export class GasContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new GasContract(address);
    }

    static createFromConfig(code: Cell, address: Address) {
        const data = beginCell().storeAddress(address).storeAddress(address).endCell();
        const init = {code, data};
        return new GasContract(contractAddress(0, init), init);
    }

    async sendSmth(
        provider: ContractProvider,
        via: Sender,
        address: Address,
        value: bigint,
        opcode: number,
        queryId: number,
        gas: number,
    ) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(opcode, 32)
                .storeUint(queryId, 64)
                .storeAddress(address)
                .endCell(),
        });
    }

    async getStoredData(provider: ContractProvider) {
        const result = await provider.get('get_stored_data', []);
        return result.stack.readCell()
    }
}