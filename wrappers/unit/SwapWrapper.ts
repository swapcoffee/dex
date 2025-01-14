import {
    Address,
    beginCell, BitReader, BitString,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice
} from '@ton/core';
import {DepositLiquidityParams, NotificationData, PoolParams, SwapParams, SwapStepParams} from "../types";

export class SwapWrapper implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }


    static createFromConfig(code: Cell,
                            factoryAddress: Address,
                            asset1: Slice,
                            asset2: Slice,
                            amm: number,
                            ammSettings: Cell | null,
                            reserve1: bigint,
                            reserve2: bigint,
                            totalSupply: bigint,
                            protocolFee: number,
                            lpFee: number,
                            initCodeCell: Cell = beginCell().endCell()
    ) {
        const data = beginCell()
            .storeRef(initCodeCell)
            .storeRef(
                beginCell()
                    .storeAddress(factoryAddress)
                    .storeUint(0, 2)
                    .storeSlice(asset1)
                    .storeSlice(asset2)
                    .storeUint(amm, 3)
            )
            .storeMaybeRef(ammSettings)
            .storeUint(1, 1)
            .storeCoins(reserve1)
            .storeCoins(reserve2)
            .storeCoins(totalSupply)
            .storeUint(protocolFee, 16) // protocol fee
            .storeUint(lpFee, 16) // lp fee
            .storeRef(beginCell().endCell()) // lp wallet code
            .endCell();

        const init = {code, data};
        return new SwapWrapper(contractAddress(0, init), init);
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
            lp: res.stack.readBigNumber()
        }
    }

    async getDirectionFromProof(provider: ContractProvider, proof: Cell, previous_asset_hint: Slice | null = null) {
        if (previous_asset_hint === null) {
            previous_asset_hint = new Slice(new BitReader(BitString.EMPTY), []);
        }
        let res = await provider.get("get_dir_from_proof", [
            {type: 'cell', cell: proof},
            {type: 'slice', cell: beginCell().storeSlice(previous_asset_hint).endCell()}
        ]);
        return res.stack.readBigNumber();
    }

    async getPerformSwap(provider: ContractProvider,
                         direction: number,
                         amount: bigint,
                         minOutAmount: bigint
    ) {
        let res = await provider.get("get_perform_swap", [
            {type: 'int', value: BigInt(direction)},
            {type: 'int', value: amount},
            {type: 'int', value: minOutAmount}
        ]);
        return {
            inputAmount: res.stack.readBigNumber(),
            outAmount: res.stack.readBigNumber(),
            reserveIn: res.stack.readBigNumber(),
            reserveOut: res.stack.readBigNumber(),
            lpFee: res.stack.readBigNumber(),
        }
    }

    async sendSwapInternal(provider: ContractProvider,
                           via: Sender,
                           value: bigint,
                           body: Cell
    ) {
        const b = beginCell()
            .storeUint(0xc0ffee20, 32)
            .storeUint(0, 64)
            .storeSlice(body.asSlice())
        return await this.sendMessage(provider, via, value, b.endCell());
    }

    async getPoolData(provider: ContractProvider
    ) {
        let res = await provider.get("get_pool_data", []);
        return {
            v: res.stack.readNumber(),
            asset1: res.stack.readCellOpt(),
            asset2: res.stack.readCellOpt(),
            amm: res.stack.readBigNumber(),
            isActive: res.stack.readBigNumber(),
            reserve1: res.stack.readBigNumber(),
            reserve2: res.stack.readBigNumber(),
            totalSupply: res.stack.readBigNumber(),
            ammSettings: res.stack.readCellOpt(),
            protocolFee: res.stack.readBigNumber(),
            lpFee: res.stack.readBigNumber(),
        }
    }

}
