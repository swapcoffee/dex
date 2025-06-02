import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultJetton} from "../wrappers/VaultJetton";
import {
    AMM, AssetExtra, AssetJetton, AssetNative,
    DepositLiquidityParams,
    DepositLiquidityParamsTrimmed,
    NotificationData,
    PoolParams
} from "../wrappers/types";
import {CodeCells, compileCodes} from "./utils";
import {BlockchainTransaction} from "@ton/sandbox/dist/blockchain/Blockchain";
import {VaultExtra} from "../wrappers/VaultExtra";
import {printTransactions} from "../wrappers/utils";
import {PoolJettonBased} from "../wrappers/PoolJettonBased";
import { DEFAULT_TIMEOUT, deployJettonWithVault, deployNativeVault, JettonDataWithVault } from './helpers';


enum VaultTypes {
    NATIVE_VAULT,
    JETTON_VAULT_1,
    JETTON_VAULT_2
}

describe('Test', () => {
    async function createPool(
        sender: SandboxContract<TreasuryContract>,
        vault: SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra>,
        amount: bigint,
        param: PoolParams,
        notification: NotificationData | null
    ) {
        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendCreatePoolNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                sender.address,
                param,
                notification
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
            return await jettonVault.sendCreatePoolJetton(
                sender.getSender(),
                toNano(1),
                vault.address,
                amount,
                sender.address,
                param,
                notification
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendCreatePoolExtra(
                sender.getSender(),
                toNano(1),
                sender.address,
                param,
                notification
            )
        } else {
            throw new Error("unexpected asset type")
        }
    }

    async function depositLiquidity(
        sender: SandboxContract<TreasuryContract>,
        vault: SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra>,
        amount: bigint,
        param: DepositLiquidityParams
    ) {
        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendDepositLiquidityNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                param,
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
            return await jettonVault.sendDepositLiquidityJetton(
                sender.getSender(),
                toNano(1),
                vault.address,
                amount,
                param
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendDepositLiquidityExtra(
                sender.getSender(),
                toNano(1),
                param,
            )
        } else {
            throw new Error("unexpected asset type")
        }
    }

    async function validateVaultPayout(txs: BlockchainTransaction[],
                                       t: VaultTypes,
                                       assetValue: bigint) {
        if (t == VaultTypes.NATIVE_VAULT) {
            expect(txs).toHaveTransaction(
                {
                    from: resolveVault(t).address,
                    to: user.address,
                    success: true,
                    exitCode: 0
                }
            )
        } else {
            const asset = (await resolveVault(t).getAssetParsed()) as AssetJetton
            expect(txs).toHaveTransaction(
                {
                    from:
                        await blockchain.openContract(
                            JettonMaster.createFromAddress(
                                new Address(
                                    Number(asset.chain),
                                    beginCell().storeUint(asset.hash, 256).endCell().beginParse().loadBuffer(32)
                                )
                            )
                        ).getWalletAddress(user.address),
                    to: user.address,
                    success: true,
                    exitCode: 0,
                    op: 0xd53276db,
                    body: beginCell()
                        .storeUint(0xd53276db, 32)
                        .storeUint(0, 64)
                        .endCell()
                }
            )

        }
    }

    async function getWallet(
        user: Address,
        pool: SandboxContract<PoolJettonBased>
    ) {
        return blockchain.openContract(
            JettonWallet.createFromAddress(
                await pool.getWalletAddress(user)
            )
        )

    }

    async function getUserLp(
        user: Address,
        pool: SandboxContract<PoolJettonBased>
    ) {
        let wallet = await getWallet(user, pool)
        return await wallet.getWalletBalance()
    }

    async function getWalletAddress(
        user: Address,
        pool: SandboxContract<PoolJettonBased>
    ) {
        let wallet = await getWallet(user, pool)
        return wallet.address
    }

    function resolveVault(type: VaultTypes): SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra> {
        if (type == VaultTypes.NATIVE_VAULT) {
            return nativeVault
        } else if (type == VaultTypes.JETTON_VAULT_1) {
            return jetton1.vault
        } else if (type == VaultTypes.JETTON_VAULT_2) {
            return jetton2.vault
        } else {
            throw Error("Unknown type")
        }
    }

    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    }, DEFAULT_TIMEOUT);

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jetton1: JettonDataWithVault
    let jetton2: JettonDataWithVault
    let nativeVault: SandboxContract<VaultNative>

    let testArguments = [
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ];

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(100.0)});
        user = await blockchain.treasury('user', {balance: toNano(100.0)});
        console.log('admin address =', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        console.log('factory address =', factory.address.toRawString());
        await factory.sendDeploy(admin.getSender(), toNano(1.0));

        jetton1 = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST1'
        )
        jetton2 = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST2'
        )
        nativeVault = await deployNativeVault(blockchain, factory, admin)

        await jetton1.wallet.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(50.0)
        )
        await jetton2.wallet.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(50.0)
        )
    }, DEFAULT_TIMEOUT);

    test.each(testArguments)
    ('empty pool, failed to withdraw liq, no wallet, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            100n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        let txs = await createPool(user,
            resolveVault(t2),
            100n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        printTransactions(txs.transactions);
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        // pool not created => Error: Trying to run get method on non-active contract
        await expect(async () => {
            await getWallet(user.address, pool)
        }).rejects.toThrow()
    });

    test.each(testArguments)
    ('correct pool, failed to withdraw a lot of liq, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        let wallet = await getWallet(user.address, pool);
        let txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), toNano('1.0'));
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: wallet.address,
            success: false,
            exitCode: 706
        })

    });

    test.each(testArguments)
    ('correct pool, failed to withdraw zero of liq, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        let wallet = await getWallet(user.address, pool);
        let txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), 0n);
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: wallet.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: wallet.address,
            to: pool.address,
            success: false,
            exitCode: 264
        })

    });

    test.each(testArguments)
    ('correct pool, ok to withdraw all available liq, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        let wallet = await getWallet(user.address, pool);
        let txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), toNano('1.0') - 1_000n);

        printTransactions(txs.transactions)

        expect((await pool.getJettonData()).totalSupply).toBe(1_000n);
        expect((await getUserLp(user.address, pool))).toBe(0n);
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: wallet.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: wallet.address,
            to: pool.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t1).address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t2).address,
            success: true,
            exitCode: 0
        })

        await validateVaultPayout(txs.transactions, t1, toNano('1.0') - 1_000n);
        await validateVaultPayout(txs.transactions, t2, toNano('1.0') - 1_000n);
    });

    test.each(testArguments)
    ('correct pool, ok to withdraw a bit of liq, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        let wallet = await getWallet(user.address, pool);
        let txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), 1_000n);

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) - 1_000n);
        expect((await getUserLp(user.address, pool))).toBe(toNano(1) - 1_000n - 1_000n);
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: wallet.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: wallet.address,
            to: pool.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t1).address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t2).address,
            success: true,
            exitCode: 0
        })

        await validateVaultPayout(txs.transactions, t1, 1_000n);
        await validateVaultPayout(txs.transactions, t2, 1_000n);
    });

    test.each(testArguments)
    ('create pool, withdraw a bit, supply liq, withdraw a bit, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );

        // init pool
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        // withdraw a bit
        let wallet = await getWallet(user.address, pool);
        let txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), 1_000n);
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) - 1_000n);
        expect((await getUserLp(user.address, pool))).toBe(toNano(1) - 1_000n - 1_000n);


        await depositLiquidity(user, resolveVault(t1), 3000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    0n,
                    user.address,
                    null,
                    null
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        txs = await depositLiquidity(user, resolveVault(t2), 3000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    0n,
                    user.address,
                    null,
                    null
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) - 1_000n + 3_000n);
        expect((await getUserLp(user.address, pool))).toBe(toNano(1) - 1_000n - 1_000n + 3_000n);

        // withdraw a bit
        wallet = await getWallet(user.address, pool);
        txs = await wallet.sendBurnTokens(user.getSender(), toNano('1.0'), 5_000n);
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) - 1_000n + 3_000n - 5_000n);
        expect((await getUserLp(user.address, pool))).toBe(toNano(1) - 1_000n - 1_000n + 3_000n - 5_000n);


        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: wallet.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: wallet.address,
            to: pool.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t1).address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: resolveVault(t2).address,
            success: true,
            exitCode: 0
        })

        await validateVaultPayout(txs.transactions, t1, 5_000n);
        await validateVaultPayout(txs.transactions, t2, 5_000n);
    });

    test.each(testArguments)
    ('create pool, fail to withdraw, lp went to another user, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                null
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );

        // init pool
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));

        let wallet = await getWallet(user.address, pool);

        let wallet2 = await getWallet(admin.address, pool);

        let txs = await wallet.sendBurnTokens(user.getSender(),
            toNano('1.0'),
            1_000n,
            admin.address,
            beginCell()
                .storeUint(1, 1) // use on failure address
                .storeUint(0, 32) // deadline
                .storeUint(0, 2) // no condition
                .storeUint(0, 2) // extra_settings, on_success
                .endCell()
            );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect((await getUserLp(user.address, pool))).toBe(toNano(1) - 1_000n - 1_000n);
        expect((await getUserLp(admin.address, pool))).toBe(1_000n);

        expect(txs.transactions).toHaveTransaction({
            from: wallet.address,
            to: pool.address,
            success: true,
            exitCode: 268
        })

        expect(txs.transactions).toHaveTransaction({
            from: pool.address,
            to: wallet2.address,
            success: true,
            exitCode: 0
        })
    });
});
