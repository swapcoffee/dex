import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode } from '@ton/core';
import {DepositLiquidityParams, NotificationData, PoolParams, SwapParams, SwapStepParams} from "./types";

export class PoolCreator implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new PoolCreator(address);
    }

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body
        });
    }

    async sendWithdrawFunds(provider: ContractProvider, via: Sender, value: bigint) {
        const b = beginCell()
            .storeUint(0xc0ffee07, 32)
            .storeUint(0, 64);
        await this.sendMessage(provider, via, value, b.endCell());
    }

}
