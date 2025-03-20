import {Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, Slice} from '@ton/core';
import {
    Asset,
    DepositLiquidityParams,
    NotificationData,
    PoolCreationParams,
    PoolParams, PrivatePoolCreationParams, PublicPoolCreationParams,
    SwapParams,
    SwapStepParams
} from './types';
import { Maybe } from '@ton/core/dist/utils/maybe';

export class VaultNative implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new VaultNative(address);
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

    async sendSwapNative(provider: ContractProvider, via: Sender, value: bigint, amount: bigint, stepParams: SwapStepParams, params: SwapParams) {
        const b = beginCell()
            .storeUint(0xc0ffee00, 32)
            .storeUint(0, 64)
            .storeCoins(amount);
        stepParams.write(b);
        b.storeRef(params.toCell());
        await this.sendMessage(provider, via, value, b.endCell());
    }

    async sendCreatePoolNative(provider: ContractProvider, via: Sender, value: bigint, amount: bigint, recipient: Address, params: PoolParams, notification_data: NotificationData | null) {
        await this.sendCreatePoolNativeFromParams(
            provider,
            via,
            value,
            amount,
            params,
            new PoolCreationParams(
                new PublicPoolCreationParams(recipient, notification_data),
                new PrivatePoolCreationParams(true, null)
            )
        )
    }

    async sendCreatePoolNativeFromParams(provider: ContractProvider, via: Sender, value: bigint, amount: bigint, params: PoolParams, creation_params: PoolCreationParams) {
        const b = beginCell()
            .storeUint(0xc0ffee02, 32)
            .storeUint(0, 64)
            .storeCoins(amount)
        params.write(b)
        creation_params.write(b)
        await this.sendMessage(provider, via, value, b.endCell())
    }

    async sendDepositLiquidityNative(provider: ContractProvider, via: Sender, value: bigint, input_amount: bigint, params: DepositLiquidityParams) {
        const b = beginCell()
            .storeUint(0xc0ffee04, 32)
            .storeUint(0, 64)
            .storeCoins(input_amount);
        params.write(b);
        await this.sendMessage(provider, via, value, b.endCell());
    }

    async getIsActive(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get("is_active", []);
        return res.stack.readBigNumber();
    }

    async getAsset(provider: ContractProvider): Promise<Slice> {
        const res = await provider.get("get_asset", []);
        return res.stack.readCell().beginParse();
    }

    async getAssetParsed(provider: ContractProvider): Promise<Asset> {
        return Asset.fromSlice(await this.getAsset(provider));
    }
}
