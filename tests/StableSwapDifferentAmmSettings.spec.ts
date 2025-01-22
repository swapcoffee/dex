import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultJetton} from "../wrappers/VaultJetton";
import {CodeCells, compileCodes, deployJetton} from "./utils";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultNative} from "../wrappers/VaultNative";
import {
    AMM,
    AssetExtra,
    AssetJetton,
    AssetNative,
    PoolParams, SwapParams, SwapStepParams
} from "../wrappers/types";
import {VaultExtra} from "../wrappers/VaultExtra";

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jettonMaster1: SandboxContract<JettonMaster>;
    let vaultNative: SandboxContract<VaultNative>;
    let vaultJetton1: SandboxContract<VaultJetton>;

    async function doSwap(
        sender: SandboxContract<TreasuryContract>,
        vault: SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra>,
        amount: bigint,
        swapStepParam: SwapStepParams,
        params: SwapParams
    ) {
        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendSwapNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                swapStepParam,
                params
            )
        } else if (asset instanceof AssetJetton) {
            let masterContract = blockchain.openContract(
                JettonMaster.createFromAddress(
                    new Address(
                        Number(asset.chain),
                        beginCell().storeUint(asset.hash, 256).endCell().beginParse().loadBuffer(32)
                    )
                )
            )
            let jettonVault = blockchain.openContract(
                JettonWallet.createFromAddress(
                    await masterContract.getWalletAddress(sender.address)
                )
            )
            return await jettonVault.sendSwapJetton(
                sender.getSender(),
                toNano(1),
                vault.address,
                amount,
                swapStepParam,
                params
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendSwapExtra(
                sender.getSender(),
                toNano(1),
                swapStepParam,
                params
            )
        } else {
            throw new Error("unexpected asset type")
        }
    }

    async function initBch() {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(1000.0)});
        console.log('admin address =', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        await factory.sendDeploy(admin.getSender(), toNano(1.0));

        let deploy = await deployJetton(blockchain, admin, "TST1");
        jettonMaster1 = deploy.master;

        await factory.sendCreateVault(admin.getSender(), toNano(.04), null);
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster1.address);
    }

    async function initPool(first_normalizer: number, second_normalizer: number, first_asset: bigint, second_asset: bigint) {
        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));

        let adminJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(jettonMaster1.address)).getWalletAddress(admin.address)
            )
        )

        // native -> jetton1 stable
        {
            await vaultNative.sendCreatePoolNative(
                admin.getSender(),
                toNano(1) + first_asset,
                first_asset,
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.CurveFiStable
                ),
                beginCell()
                    .storeUint(2_000, 16)
                    .storeCoins(first_normalizer)
                    .storeCoins(second_normalizer)
                    .endCell(),
                null
            )

            await adminJettonWallet1.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton1.address,
                second_asset,
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(first_normalizer).storeCoins(second_normalizer).endCell(),
                null
            )
        }
    }

    test('test do stable swap 0 0, forward', async () => {
        await initBch();
        await initPool(1, 1, 50_000n, 5_000_000n);

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jettonMaster1.address),
                AMM.CurveFiStable
            )
        );
        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));

        let wallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await jettonMaster1.getWalletAddress(admin.address)
            )
        );
        let before = await wallet.getWalletBalance();

        let txs = await doSwap(admin,
            vaultNative,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultNative.getAsset(), await vaultJetton1.getAsset(), AMM.CurveFiStable),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: vaultJetton1.address,
            success: true,
            exitCode: 0
        })
        let after = await wallet.getWalletBalance();

        console.log(after - before);
        expect(after - before).toBe(1607n);
    });

    test('test do stable swap 3 0, forward', async () => {
        await initBch();
        await initPool(1_000, 1, 50_000n, 5_000_000n);

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jettonMaster1.address),
                AMM.CurveFiStable
            )
        );
        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));

        let wallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await jettonMaster1.getWalletAddress(admin.address)
            )
        );
        let before = await wallet.getWalletBalance();

        let txs = await doSwap(admin,
            vaultNative,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultNative.getAsset(), await vaultJetton1.getAsset(), AMM.CurveFiStable),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: vaultJetton1.address,
            success: true,
            exitCode: 0
        })
        let after = await wallet.getWalletBalance();

        console.log(after - before);
        expect(after - before).toBe(989764n);
    });

    test('test do stable swap 0 0, backward', async () => {
        await initBch();
        await initPool(1, 1, 5_000_000n, 50_000n);

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jettonMaster1.address),
                AMM.CurveFiStable
            )
        );
        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));


        let txs = await doSwap(admin,
            vaultJetton1,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultNative.getAsset(), await vaultJetton1.getAsset(), AMM.CurveFiStable),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: vaultNative.address,
            success: true,
            exitCode: 0,
            body: beginCell()
                .storeUint(0xc0ffee21, 32)
                .storeUint(0, 64)
                .storeAddress(admin.address)
                .storeCoins(1607n) // <<<<<
                .storeMaybeRef(null)
                .storeMaybeRef(
                    beginCell().storeAddress(factory.address)
                        .storeUint(1, 2)
                        .storeSlice(await vaultNative.getAsset())
                        .storeSlice(await vaultJetton1.getAsset())
                        .storeUint(1, 3)
                )
                .endCell()
        })
    });

    test('test do stable swap 0 3, backward', async () => {
        await initBch();
        await initPool(1, 1_000, 5_000_000n, 50_000n);

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jettonMaster1.address),
                AMM.CurveFiStable
            )
        );
        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));

        let txs = await doSwap(admin,
            vaultJetton1,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultNative.getAsset(), await vaultJetton1.getAsset(), AMM.CurveFiStable),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: vaultNative.address,
            success: true,
            exitCode: 0,
            body: beginCell()
                .storeUint(0xc0ffee21, 32)
                .storeUint(0, 64)
                .storeAddress(admin.address)
                .storeCoins(989764n) // <<<<<
                .storeMaybeRef(null)
                .storeMaybeRef(
                    beginCell().storeAddress(factory.address)
                        .storeUint(1, 2)
                        .storeSlice(await vaultNative.getAsset())
                        .storeSlice(await vaultJetton1.getAsset())
                        .storeUint(1, 3)
                )
                .endCell()
        })
    });

});