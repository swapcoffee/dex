import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    Slice,
} from '@ton/core';
import { AMM, Asset, AssetExtra, AssetJetton, AssetNative, PoolParams } from './types';
import { CodeCells } from '../tests/utils';
import { PoolConstantProduct } from './PoolConstantProduct';
import { PoolCurveFiStable } from './PoolCurveFiStable';
import { PoolJettonBased } from './PoolJettonBased';

export function buildDataCell(admin: Address, withdrawer: Address, codeCells: CodeCells, nonce: number = 0): Cell {
    const vaultCodeDict = Dictionary.empty(Dictionary.Keys.Uint(2), Dictionary.Values.Cell());
    vaultCodeDict.set(0, codeCells.vaultNative);
    vaultCodeDict.set(1, codeCells.vaultJetton);
    vaultCodeDict.set(2, codeCells.vaultExtra);
    const poolCodeDict = Dictionary.empty(Dictionary.Keys.Uint(3), Dictionary.Values.Cell());
    poolCodeDict.set(0, codeCells.poolConstantProduct);
    poolCodeDict.set(1, codeCells.poolCurveFiStable);
    return beginCell()
        .storeAddress(admin)
        .storeAddress(withdrawer)
        .storeRef(
            beginCell()
                .storeRef(codeCells.lpWallet)
                .storeRef(codeCells.init)
                .storeRef(codeCells.liquidityDepository)
                .storeRef(codeCells.poolCreator)
                .endCell(),
        )
        .storeRef(beginCell().storeDict(vaultCodeDict).storeDict(poolCodeDict).endCell())
        .storeUint(nonce, 32)
        .endCell();
}

export class Factory implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Factory(address);
    }

    static createFromData(admin: Address, codeCells: CodeCells, withdrawer: Address = admin, workchain = 0, nonce = 0) {
        const data = buildDataCell(admin, withdrawer, codeCells, nonce);
        const init = { code: codeCells.factory, data };
        return new Factory(contractAddress(workchain, init), init);
    }

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell, bounce: boolean = true) {
        await provider.internal(via, {
            value,
            bounce,
            body,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await this.sendMessage(provider, via, value, beginCell().endCell(), false);
    }

    async sendCreateVault(provider: ContractProvider, via: Sender, value: bigint, asset: any) {
        const b = beginCell().storeUint(0xc0ffee06, 32).storeUint(0, 64);
        this.serializeAsset(b, asset);
        await this.sendMessage(provider, via, value, b.endCell());
    }

    async sendUpdateAdmin(provider: ContractProvider, via: Sender, value: bigint, address: Address | null) {
        return await this.sendMessage(
            provider,
            via,
            value,
            beginCell().storeUint(0xc0ffee40, 32).storeUint(0, 64).storeAddress(address).endCell(),
        );
    }

    async sendUpdateWithdrawer(provider: ContractProvider, via: Sender, value: bigint, address: Address | null) {
        return await this.sendMessage(
            provider,
            via,
            value,
            beginCell().storeUint(0xc0ffee46, 32).storeUint(0, 64).storeAddress(address).endCell(),
        );
    }

    async sendUpdateCodeCells(provider: ContractProvider, via: Sender, value: bigint, first: Cell, second: Cell) {
        return await this.sendMessage(
            provider,
            via,
            value,
            beginCell().storeUint(0xc0ffee44, 32).storeUint(0, 64).storeRef(first).storeRef(second).endCell(),
        );
    }

    async sendUpdateContract(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        destination: Address | null,
        code: Cell | null,
        data: Cell | null,
    ) {
        return await this.sendMessage(
            provider,
            via,
            value,
            beginCell()
                .storeUint(0xc0ffee45, 32)
                .storeUint(0, 64)
                .storeAddress(destination)
                .storeMaybeRef(code)
                .storeMaybeRef(data)
                .endCell(),
        );
    }

    async sendUpdatePool(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        pool_params: PoolParams,
        protocol_fee: number | null,
        lp_fee: number | null,
        is_active: boolean | null,
    ) {
        const b = beginCell().storeUint(0xc0ffee41, 32).storeUint(0, 64);
        pool_params.write(b);

        const paramBuilder = beginCell();
        let flag = 0;
        if (protocol_fee != null || lp_fee != null) {
            flag += 1;
            paramBuilder.storeUint(protocol_fee!, 16);
            paramBuilder.storeUint(lp_fee!, 16);
        }
        if (is_active != null) {
            flag += 2;
            paramBuilder.storeBit(is_active);
        }

        b.storeRef(beginCell().storeUint(flag, 2).storeBuilder(paramBuilder).endCell());
        await this.sendMessage(provider, via, value, b.endCell());
    }

    async sendActivateVault(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        asset: any,
        wallet: Address | null,
    ) {
        const b = beginCell().storeUint(0xc0ffee42, 32).storeUint(0, 64);
        this.serializeAsset(b, asset);
        await this.sendMessage(provider, via, value, b.storeAddress(wallet).endCell());
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        pool: Address,
        asset: any,
        amount: bigint,
        receiver: Address,
    ) {
        const b = beginCell().storeUint(0xc0ffee43, 32).storeUint(0, 64).storeAddress(pool);
        this.serializeAsset(b, asset);
        b.storeCoins(amount).storeAddress(receiver);
        await this.sendMessage(provider, via, value, b.endCell());
    }

    async getVaultAddress(provider: ContractProvider, asset: any) {
        const b = beginCell();
        this.serializeAsset(b, asset);
        let res = await provider.get('get_vault_address', [{ type: 'slice', cell: b.endCell() }]);
        return res.stack.readAddress();
    }

    async getAdminAddress(provider: ContractProvider) {
        let res = await provider.get('get_admin_address', []);
        return res.stack.readAddressOpt();
    }

    async getCode(provider: ContractProvider) {
        let res = await provider.get('get_code', []);
        return [res.stack.readCell(), res.stack.readCell()];
    }

    async getPoolAddress(
        provider: ContractProvider,
        asset1: any,
        asset2: any,
        amm: AMM,
        ammSettings: Cell | null = null,
    ) {
        const b1 = beginCell();
        const b2 = beginCell();
        this.serializeAsset(b1, asset1);
        this.serializeAsset(b2, asset2);
        if (amm == AMM.ConstantProduct) {
            let res = await provider.get('get_pool_address_no_settings', [
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
            ]);
            return res.stack.readAddress();
        } else {
            let res = await provider.get('get_pool_address', [
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
                { type: 'cell', cell: ammSettings!! },
            ]);
            return res.stack.readAddress();
        }
    }

    async getPoolJettonBased(
        provider: ContractProvider,
        asset1: any,
        asset2: any,
        amm: AMM,
        ammSettings: Cell | null = null,
    ): Promise<PoolJettonBased> {
        const address = await this.getPoolAddress(provider, asset1, asset2, amm, ammSettings);
        if (amm == AMM.ConstantProduct) {
            return PoolConstantProduct.createFromAddress(address);
        } else if (amm == AMM.CurveFiStable) {
            return PoolCurveFiStable.createFromAddress(address);
        } else {
            throw new Error('unexpected AMM ' + amm);
        }
    }

    async getPoolAddressHash(
        provider: ContractProvider,
        asset1: any,
        asset2: any,
        amm: AMM,
        ammSettings: Cell | null = null,
    ) {
        const b1 = beginCell();
        const b2 = beginCell();
        this.serializeAsset(b1, asset1);
        this.serializeAsset(b2, asset2);
        let res = await provider.get('get_pool_address', [
            { type: 'slice', cell: b1.endCell() },
            { type: 'slice', cell: b2.endCell() },
            { type: 'int', value: BigInt(amm) },
            ammSettings === null ? { type: 'null' } : { type: 'cell', cell: ammSettings },
        ]);
        let stack = res.stack;
        stack.readAddress();
        return stack.readBigNumber();
    }

    async getPoolCreatorAddress(
        provider: ContractProvider,
        owner: Address,
        asset1: any,
        asset2: any,
        amm: AMM,
        ammSettings: Cell | null = null,
    ) {
        const b1 = beginCell();
        const b2 = beginCell();
        this.serializeAsset(b1, asset1);
        this.serializeAsset(b2, asset2);
        if (amm == AMM.ConstantProduct) {
            let res = await provider.get('get_pool_creator_address_no_settings', [
                { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
            ]);
            return res.stack.readAddress();
        } else {
            let res = await provider.get('get_pool_creator_address', [
                { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
                { type: 'cell', cell: ammSettings!! },
            ]);
            return res.stack.readAddress();
        }
    }

    async getLiquidityDepositoryAddress(
        provider: ContractProvider,
        owner: Address,
        asset1: any,
        asset2: any,
        amm: AMM,
        ammSettings: Cell | null = null,
    ) {
        const b1 = beginCell();
        const b2 = beginCell();
        this.serializeAsset(b1, asset1);
        this.serializeAsset(b2, asset2);
        if (amm == AMM.ConstantProduct) {
            let res = await provider.get('get_liquidity_depository_address_no_settings', [
                { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
            ]);
            return res.stack.readAddress();
        } else {
            let res = await provider.get('get_liquidity_depository_address', [
                { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
                { type: 'slice', cell: b1.endCell() },
                { type: 'slice', cell: b2.endCell() },
                { type: 'int', value: BigInt(amm) },
                { type: 'cell', cell: ammSettings!! },
            ]);
            return res.stack.readAddress();
        }
    }

    private serializeAsset(b: Builder, asset: any) {
        if (asset === null) {
            AssetNative.INSTANCE.write(b);
        } else if (asset instanceof Address) {
            AssetJetton.fromAddress(asset).write(b);
        } else if (typeof asset === 'bigint') {
            new AssetExtra(asset.valueOf()).write(b);
        } else if (asset instanceof Asset) {
            asset.write(b);
        } else if (asset instanceof Slice) {
            b.storeSlice(asset);
        } else {
            throw new Error('unexpected asset');
        }
    }
}
