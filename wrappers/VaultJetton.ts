import {Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, Slice} from '@ton/core';
import {Asset} from "./types";

export class VaultJetton implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new VaultJetton(address);
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
