import {Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode} from '@ton/core';
import {DepositLiquidityParams, NotificationData, PoolParams, SwapParams, SwapStepParams} from "../types";

export class VolatileWrapper implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new VolatileWrapper(address);
    }

    static createFromConfig(code: Cell, workchain = 0) {
        const data = beginCell().endCell();
        const init = {code, data};
        return new VolatileWrapper(contractAddress(workchain, init), init);
    }

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body
        });
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await this.sendMessage(provider, via, value, beginCell().endCell());
    }

    async getAddLiquidity(provider: ContractProvider,
                          total_supply: bigint,
                          amount1: bigint,
                          amount2: bigint,
                          reserve1: bigint,
                          reserve2: bigint
    ) {
        let res = await provider.get("get_add_liq", [
            {type: 'int', value: total_supply},
            {type: 'int', value: amount1},
            {type: 'int', value: amount2},
            {type: 'int', value: reserve1},
            {type: 'int', value: reserve2}
        ]);
        return {
            amount1Initial: res.stack.readBigNumber(),
            amount2Initial: res.stack.readBigNumber(),
            lp: res.stack.readBigNumber(),
            lpToProtocol: res.stack.readBigNumber(),
        }
    }

    async getSwap(provider: ContractProvider,
                  input_amount: bigint,
                  reserve1: bigint,
                  reserve2: bigint,
    ) {
        let res = await provider.get("get_swap_volatile", [
            {type: 'int', value: input_amount},
            {type: 'int', value: reserve1},
            {type: 'int', value: reserve2},
        ]);
        return {
            amountOut: res.stack.readBigNumber()
        }
    }

}
