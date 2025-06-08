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

export class VaultExtra implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new VaultExtra(address);
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

    // TODO: add extra currencies
    async sendSwapExtra(provider: ContractProvider, via: Sender, value: bigint, stepParams: SwapStepParams, params: SwapParams) {
        const b = beginCell()
            .storeUint(0xc0ffee01, 32)
            .storeUint(0, 64);
        stepParams.write(b);
        b.storeRef(params.toCell());
        await this.sendMessage(provider, via, value, b.endCell());
    }

    // TODO: add extra currencies
    async sendCreatePoolExtra(provider: ContractProvider, via: Sender, value: bigint, recipient: Address, params: PoolParams, notification_data: NotificationData | null) {
        await this.sendCreatePoolExtraFromParams(
            provider,
            via,
            value,
            params,
            new PoolCreationParams(
                new PublicPoolCreationParams(recipient, false, notification_data),
                new PrivatePoolCreationParams(true, null)
            )
        )
    }

    // TODO: add extra currencies
    async sendCreatePoolExtraFromParams(provider: ContractProvider, via: Sender, value: bigint, params: PoolParams, creation_params: PoolCreationParams) {
        await this.sendMessage(provider, via, value, this.buildCreatePoolExtraFromParams(params, creation_params));
    }

    buildCreatePoolExtraFromParams(
        params: PoolParams,
        creation_params: PoolCreationParams
    ): Cell {
        const b = beginCell()
            .storeUint(0xc0ffee03, 32)
            .storeUint(0, 64)
        params.write(b)
        creation_params.write(b)
        return b.endCell()
    }

    // TODO: add extra currencies
    async sendDepositLiquidityExtra(provider: ContractProvider, via: Sender, value: bigint, params: DepositLiquidityParams) {
        const b = beginCell()
            .storeUint(0xc0ffee05, 32)
            .storeUint(0, 64);
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
