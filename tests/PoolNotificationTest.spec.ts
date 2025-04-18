import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, toNano} from '@ton/core';
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
    NotificationDataSingle,
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
    function encapsulate(notification: Cell): Cell {
        return beginCell()
            .storeUint(0xc0ffee36, 32)
            .storeUint(0, 64)
            .storeRef(notification)
            .endCell();
    }

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

    async function getUserLp(
        user: Address,
        pool: SandboxContract<PoolJettonBased>
    ) {
        let wallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await pool.getWalletAddress(user)
            )
        )

        return await wallet.getWalletBalance()
    }

    async function getWalletAddress(
        user: Address,
        pool: SandboxContract<PoolJettonBased>
    ) {
        let wallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await pool.getWalletAddress(user)
            )
        )

        return wallet.address
    }

    async function validateBadResponseFromVault(
        txs: BlockchainTransaction[],
        t: VaultTypes,
        assetValue: bigint,
        cell: Cell,
        notificationReceiver: Address
    ) {
        if (t == VaultTypes.NATIVE_VAULT) {
            expect(txs).toHaveTransaction(
                {
                    from: resolveVault(t).address,
                    to: notificationReceiver,
                    success: true,
                    exitCode: 0,
                    body: cell
                }
            )
        } else {
            if (notificationReceiver == user.address) {
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
                        op: 0x7362d09c,
                        body: beginCell()
                            .storeUint(0x7362d09c, 32)
                            .storeUint(0, 64)
                            .storeCoins(assetValue)
                            .storeAddress(resolveVault(t).address)
                            .storeMaybeRef(cell)
                            .endCell()
                    }
                )
            } else {
                expect(txs).toHaveTransaction(
                    {
                        from: resolveVault(t).address,
                        to: notificationReceiver,
                        success: true,
                        exitCode: 0,
                        body: cell
                    }
                )
            }
        }
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
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1, 0],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2, 0],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2, 0],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT, 0],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT, 0],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1, 0],

        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1, 1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2, 1],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2, 1],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT, 1],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT, 1],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1, 1],

        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1, 2],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2, 2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2, 2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT, 2],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT, 2],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1, 2],
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
    ('init pool success, success notification, %i, %i, %i', async (t1, t2, n) => {
        let notificationAddress;
        let resolvedNotificationAddress = user.address;
        if (n == 0) {
            notificationAddress = null;
        } else if (n == 1) {
            notificationAddress = user.address;
        } else {
            notificationAddress = admin.address;
            resolvedNotificationAddress = admin.address;
        }

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
        const notification = beginCell().storeUint(1234, 32).endCell()
        let txs = await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                new NotificationDataSingle(
                    notificationAddress,
                    toNano(1) / 8n,
                    notification
                ),
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
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: await getWalletAddress(user.address, pool),
                success: true,
                exitCode: 0
            }
        )
        if (resolvedNotificationAddress != user.address) {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: pool.address,
                    to: resolvedNotificationAddress,
                    success: true,
                    exitCode: 0,
                    body: encapsulate(notification)
                }
            )
        } else {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: await getWalletAddress(user.address, pool),
                    to: resolvedNotificationAddress,
                    success: true,
                    exitCode: 0,
                    op: 0x7362d09c,
                    body: beginCell()
                        .storeUint(0x7362d09c, 32)
                        .storeUint(0, 64)
                        .storeCoins(toNano(1) - 1_000n)
                        .storeAddress(pool.address)
                        .storeMaybeRef(encapsulate(notification))
                        .endCell()
                }
            )
        }
    });

    test.each(testArguments)
    ('init pool failed, failure notification, %i, %i, %i', async (t1, t2, n) => {

        let notificationAddress: Address | null
        let resolvedNotificationAddress: Address
        if (n == 0) {
            notificationAddress = null
            resolvedNotificationAddress = user.address
        } else if (n == 1) {
            notificationAddress = user.address
            resolvedNotificationAddress = user.address
        } else {
            notificationAddress = admin.address
            resolvedNotificationAddress = admin.address
        }

        await createPool(
            user,
            resolveVault(t1),
            20n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            null
        );
        const notification = beginCell().storeUint(12345, 32).endCell()
        let txs = await createPool(
            user,
            resolveVault(t2),
            20n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            ),
            new NotificationData(
                null,
                new NotificationDataSingle(
                    notificationAddress,
                    toNano(1) / 8n,
                    notification
                )
            )
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        printTransactions(txs.transactions);
        // pool not created => Error: Trying to run get method on non-active contract
        await expect(async () => { await pool.getJettonData() }).rejects.toThrow()

        await validateBadResponseFromVault(
            txs.transactions,
            t1,
            20n,
            encapsulate(notification),
            resolvedNotificationAddress
        )
        await validateBadResponseFromVault(
            txs.transactions,
            t2,
            20n,
            encapsulate(notification),
            resolvedNotificationAddress
        )
    });

    test.each(testArguments)
    ('supply liq success, success notification, %i, %i, %i', async (t1, t2, n) => {
        let notificationAddress;
        let resolvedNotificationAddress = user.address;
        if (n == 0) {
            notificationAddress = null;
        } else if (n == 1) {
            notificationAddress = user.address;
        } else {
            notificationAddress = admin.address;
            resolvedNotificationAddress = admin.address;
        }
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
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        await depositLiquidity(user, resolveVault(t1), toNano(1),
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
        const notification = beginCell().storeUint(123456, 32).endCell()
        let txs = await depositLiquidity(user, resolveVault(t2), toNano(1),
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    0n,
                    user.address,
                    null,
                    new NotificationData(
                        new NotificationDataSingle(
                            notificationAddress,
                            toNano(1) / 8n,
                            notification
                        ),
                        null
                    )
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) * 2n);
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n + toNano(1))

        if (resolvedNotificationAddress != user.address) {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: pool.address,
                    to: resolvedNotificationAddress,
                    success: true,
                    exitCode: 0,
                    body: encapsulate(notification)
                }
            )
        } else {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: await getWalletAddress(user.address, pool),
                    to: resolvedNotificationAddress,
                    success: true,
                    exitCode: 0,
                    op: 0x7362d09c,
                    body: beginCell()
                        .storeUint(0x7362d09c, 32)
                        .storeUint(0, 64)
                        .storeCoins(toNano(1))
                        .storeAddress(pool.address)
                        .storeMaybeRef(encapsulate(notification))
                        .endCell()
                }
            )
        }
    });

    test.each(testArguments)
    ('supply liq fail due to timeout, failure notification, %i, %i, %i', async (t1, t2, n) => {
        let notificationAddress;
        let resolvedNotificationAddress = user.address;
        if (n == 0) {
            notificationAddress = null;
        } else if (n == 1) {
            notificationAddress = user.address;
        } else {
            notificationAddress = admin.address;
            resolvedNotificationAddress = admin.address;
        }
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
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        await depositLiquidity(user, resolveVault(t1), 1_000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt(0),
                    0n,
                    user.address,
                    null,
                    new NotificationData(
                        null,
                        null
                    )
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        const notification = beginCell().storeUint(12345, 64).endCell()
        let txs = await depositLiquidity(user, resolveVault(t2), 1_000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt(0),
                    0n,
                    user.address,
                    null,
                    new NotificationData(
                        null,
                        new NotificationDataSingle(
                            notificationAddress,
                            toNano(1) / 8n,
                            notification
                        )
                    )
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n)

        await validateBadResponseFromVault(txs.transactions,
            t1,
            1_000n,
            encapsulate(notification),
            resolvedNotificationAddress
        )
        await validateBadResponseFromVault(txs.transactions,
            t2,
            1_000n,
            encapsulate(notification),
            resolvedNotificationAddress)
    });

    test.each(testArguments)
    ('supply liq fail due to huge min lp, failure notification, %i, %i, %i', async (t1, t2, n) => {
        let notificationAddress;
        let resolvedNotificationAddress = user.address;
        if (n == 0) {
            notificationAddress = null;
        } else if (n == 1) {
            notificationAddress = user.address;
        } else {
            notificationAddress = admin.address;
            resolvedNotificationAddress = admin.address;
        }
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
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        await depositLiquidity(user, resolveVault(t1), 1_000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    toNano(1),
                    user.address,
                    null,
                    new NotificationData(
                        null,
                        null
                    )
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        const notification = beginCell().storeUint(12345, 128).endCell()
        let txs = await depositLiquidity(user, resolveVault(t2), 1_000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    toNano(1),
                    user.address,
                    null,
                    new NotificationData(
                        null,
                        new NotificationDataSingle(
                            notificationAddress,
                            toNano(1) / 8n,
                            notification
                        )
                    )
                ),
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n)

        await validateBadResponseFromVault(txs.transactions,
            t1,
            1_000n,
            encapsulate(notification),
            resolvedNotificationAddress
        )
        await validateBadResponseFromVault(txs.transactions,
            t2,
            1_000n,
            encapsulate(notification),
            resolvedNotificationAddress)
    });

    test.each(testArguments)
    ('second init pool fail, failure notification, %i, %i, %i', async (t1, t2, n) => {
        let notificationAddress;
        let resolvedNotificationAddress = user.address;
        if (n == 0) {
            notificationAddress = null;
        } else if (n == 1) {
            notificationAddress = user.address;
        } else {
            notificationAddress = admin.address;
            resolvedNotificationAddress = admin.address;
        }
        const poolParams = new PoolParams(
            await resolveVault(t1).getAssetParsed(),
            await resolveVault(t2).getAssetParsed(),
            AMM.ConstantProduct
        )

        await createPool(user,
            resolveVault(t1),
            toNano(1),
            poolParams,
            null
        );

        await createPool(user,
            resolveVault(t2),
            toNano(1),
            poolParams,
            null
        )
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                poolParams.first_asset,
                poolParams.second_asset,
                AMM.ConstantProduct
            )
        );
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        await createPool(user,
            resolveVault(t1),
            toNano(1),
            poolParams,
            null
        );
        const notification = beginCell().storeUint(1234, 32).endCell()
        let txs = await createPool(user,
            resolveVault(t2),
            toNano(1),
            poolParams,
            new NotificationData(
                null,
                new NotificationDataSingle(
                    notificationAddress,
                    toNano(1) / 8n,
                    notification
                )
            )
        )

        await validateBadResponseFromVault(txs.transactions,
            t1,
            toNano(1),
            encapsulate(notification),
            resolvedNotificationAddress
        )
        await validateBadResponseFromVault(txs.transactions,
            t2,
            toNano(1),
            encapsulate(notification),
            resolvedNotificationAddress)

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);
    });

});
