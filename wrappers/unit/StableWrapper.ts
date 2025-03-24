import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleReader
} from '@ton/core';
import { CellWithLiquidityAdditionData, CellWithSwapData } from '../../tests/helpers';
import * as util from 'node:util';
import { Blockchain } from '@ton/sandbox';

export class StableWrapper implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new StableWrapper(address);
    }

    static createFromConfig(code: Cell, workchain = 0) {
        const data = beginCell().endCell();
        const init = {code, data};
        return new StableWrapper(contractAddress(workchain, init), init);
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
                          reserve2: bigint,
                          amm_settings: Cell
    ) {
        let res = await provider.get("get_add_liq", [
            {type: 'int', value: total_supply},
            {type: 'int', value: amount1},
            {type: 'int', value: amount2},
            {type: 'int', value: reserve1},
            {type: 'int', value: reserve2},
            {type: 'cell', cell: amm_settings}
        ]);
        return {
            amount1Initial: res.stack.readBigNumber(),
            amount2Initial: res.stack.readBigNumber(),
            lp: res.stack.readBigNumber()
        }
    }

    async checkMultiSwaps(
        blockchain: Blockchain,
        cellWithData: CellWithSwapData,
        ammSettings: Cell
    ) {
        const res = await blockchain.runGetMethod(
            this.address,
            'get_check_swaps_stable',
            [{type: 'cell', cell: cellWithData.cell}, {type: 'cell', cell: ammSettings}],
            {gasLimit: 100_000_000n}
        )
        const failedIndex = new TupleReader(res.stack).readBigNumber()
        if (failedIndex !== -1n) {
            const failedData = cellWithData.swap_data[Number(failedIndex)]
            throw new Error(util.format('Failed swap data: %s', failedData))
        }
    }

    async checkMultiLiquidityAdditions(
        blockchain: Blockchain,
        cellWithData: CellWithLiquidityAdditionData,
        ammSettings: Cell,
        secondDeposit: boolean
    ) {
        let methodName: string
        if (secondDeposit) {
            methodName = 'get_check_liquidity_addition_stable2'
        } else {
            methodName = 'get_check_liquidity_addition_stable'
        }
        const res = await blockchain.runGetMethod(
            this.address,
            methodName,
            [{type: 'cell', cell: cellWithData.cell}, {type: 'cell', cell: ammSettings}],
            {gasLimit: 100_000_000n}
        )
        const failedIndex = new TupleReader(res.stack).readBigNumber()
        if (failedIndex !== -1n) {
            const failedData = cellWithData.liquidity_addition_data[Number(failedIndex)]
            throw new Error(util.format('Failed liquidity addition data: %s', failedData))
        }
    }

}
