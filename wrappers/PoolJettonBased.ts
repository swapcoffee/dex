import {Address, beginCell, ContractProvider, Sender, Slice} from '@ton/core';
import {Pool} from "./Pool";

export abstract class PoolJettonBased extends Pool {

    async getJettonData(provider: ContractProvider) {
        let res = await provider.get("get_jetton_data", []);
        return {
            totalSupply: res.stack.readBigNumber(),
            isInit: res.stack.readBigNumber(),
            factory: res.stack.readAddress(),
            poolLink: res.stack.readCell().beginParse().loadStringTail(),
            lpWalletCode: res.stack.readCell()
        }
    }

    async getWalletAddress(provider: ContractProvider, user: Address) {
        let res = await provider.get("get_wallet_address", [
            {type: 'slice', cell: beginCell().storeAddress(user).endCell()},
        ]);
        return res.stack.readAddress();
    }

    async getEstimateLiquidityWithdrawAmount(provider: ContractProvider, lpAmount: bigint) {
        let res = await provider.get("estimate_liquidity_withdraw_amount", [
            {type: 'int', value: lpAmount},
        ]);
        return {
            asset1: res.stack.readBigNumber(),
            asset2: res.stack.readBigNumber(),
        };
    }

    async getEstimateLiquidityDepositAmount(provider: ContractProvider, amount1: bigint, amount2: bigint) {
        let res = await provider.get("estimate_liquidity_deposit_amount", [
            {type: 'int', value: amount1},
            {type: 'int', value: amount2},
        ]);
        return {
            asset1Used: res.stack.readBigNumber(),
            asset2Used: res.stack.readBigNumber(),
            lpAmount: res.stack.readBigNumber(),
            lpToLock: res.stack.readBigNumber(),
        };
    }

    async getEstimateSwapAmount(provider: ContractProvider, asset: Slice, amount: bigint) {
        let res = await provider.get("estimate_swap_amount", [
            {type: 'slice', cell: asset.asCell()},
            {type: 'int', value: amount},
        ]);
        return {
            inputAmount: res.stack.readBigNumber(),
            outputAmount: res.stack.readBigNumber(),
        };
    }


    async sendProvideWalletAddress(provider: ContractProvider, via: Sender, value: bigint, owner: Address) {
        const b = beginCell()
            .storeUint(0x2c76b973, 32)
            .storeUint(0, 64)
            .storeAddress(owner)
            .storeUint(1n, 1)
        await this.sendMessage(provider, via, value, b.endCell());
    }
}
