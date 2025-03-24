import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultJetton} from "../wrappers/VaultJetton";
import {
    AMM,
    AssetNative, AssetJetton, AssetExtra,
    DepositLiquidityParams,
    DepositLiquidityParamsTrimmed,
    PoolParams
} from "../wrappers/types";
import {CodeCells, compileCodes} from "./utils";
import {AccountStateActive} from "@ton/core/src/types/AccountState";
import {printTransactions} from "../wrappers/utils";
import {VaultExtra} from "../wrappers/VaultExtra";
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
        param: PoolParams
    ) {
        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendCreatePoolNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                sender.address,
                param,
                null
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
                null
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendCreatePoolExtra(
                sender.getSender(),
                toNano(1),
                sender.address,
                param,
                null
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

    let depositParam: DepositLiquidityParamsTrimmed

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(100.0)});
        user = await blockchain.treasury('user', {balance: toNano(100.0)});
        depositParam = new DepositLiquidityParamsTrimmed(
            BigInt((1 << 30) * 2),
            0n,
            user.address,
            null,
            null
        );
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

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('create pool, correct, %i, %i', async (t1, t2) => {
        let txs = await createPool(user,
            resolveVault(t1),
            toNano(10),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        printTransactions(txs.transactions);
        txs = await createPool(user,
            resolveVault(t2),
            toNano(10),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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
        let state = await blockchain.getContract(pool.address);
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(10.0));
        expect(await getUserLp(user.address, pool)).toBe(toNano(10) - 1_000n);
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('create pool failed, no liq, funds returned back, pool empty, %i, %i', async (t1, t2) => {
        let txs = await createPool(user,
            resolveVault(t1),
            500n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        printTransactions(txs.transactions);
        txs = await createPool(user,
            resolveVault(t2),
            500n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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
        let state = await blockchain.getContract(pool.address);
        expect(state.balance).toBe(0n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: pool.address,
                success: true,
                exitCode: 264
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t2).address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('send create pool to already initialized pool, do refund, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        let state = await blockchain.getContract(pool.address);
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);
        let prevTs = (await pool.getJettonData()).totalSupply;

        let txs = await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        printTransactions(txs.transactions);
        txs = await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        printTransactions(txs.transactions);

        blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        state = await blockchain.getContract(pool.address);
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');
        expect((await pool.getJettonData()).totalSupply).toBe(prevTs);
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: pool.address,
                success: true,
                exitCode: 270
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t2).address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('deposit small amount to pool, funds returned back, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            1001n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        await createPool(user,
            resolveVault(t2),
            1001n,
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );

        await depositLiquidity(user, resolveVault(t2), 500n,
            new DepositLiquidityParams(
                depositParam,
                new PoolParams(
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                )
            )
        )
        let txs = await depositLiquidity(user, resolveVault(t1), 500n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    1000n,
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
        printTransactions(txs.transactions);
        expect((await pool.getJettonData()).totalSupply).toBe(1001n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: await factory.getLiquidityDepositoryAddress(
                    user.address,
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                ),
                to: pool.address,
                success: true,
                exitCode: 269
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t2).address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('deposit less than expected LP to pool, funds returned back, %i, %i', async (t1, t2) => {
        let txs = await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        printTransactions(txs.transactions);
        txs = await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        await depositLiquidity(user, resolveVault(t1), 1000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    1500n,
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
        txs = await depositLiquidity(user, resolveVault(t2), 1000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    BigInt((1 << 30) * 2),
                    1500n,
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
        printTransactions(txs.transactions);

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        console.log("getLiquidityDepositoryAddress",
            (await factory.getLiquidityDepositoryAddress(
                user.address,
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )).toRawString()
        );
        console.log("pool.address",
            (pool.address).toRawString()
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: await factory.getLiquidityDepositoryAddress(
                    user.address,
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                ),
                to: pool.address,
                success: true,
                exitCode: 269
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t2).address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],

        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('deposit expired tx to pool, funds returned back, %i, %i', async (t1, t2) => {
        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        )
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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

        await depositLiquidity(user, resolveVault(t1), 1000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    100n,
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
        let txs = await depositLiquidity(user, resolveVault(t2), 1000n,
            new DepositLiquidityParams(
                new DepositLiquidityParamsTrimmed(
                    100n,
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
        printTransactions(txs.transactions);

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: await factory.getLiquidityDepositoryAddress(
                    user.address,
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                ),
                to: pool.address,
                success: true,
                exitCode: 268
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t2).address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each([
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

    ])
    ('second deposit, one of token refund part, success, %i, %i, %i', async (t1, t2, idx) => {
        // stage deploy
        // token1: deposit 1
        // token1: deposit 1

        // stage deposit
        // token1: deposit 2
        // token1: deposit 1
        // refund token1, 1

        let firstAmount = idx == 0 ? toNano(2) : toNano(1);
        let secondAmount = idx == 0 ? toNano(1) : toNano(2);

        let txs = await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        printTransactions(txs.transactions);
        txs = await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1));
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n);

        txs = await depositLiquidity(user, resolveVault(t1), firstAmount,
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
        printTransactions(txs.transactions);
        txs = await depositLiquidity(user, resolveVault(t2), secondAmount,
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
        printTransactions(txs.transactions);
        console.log(pool.address.toRawString());
        console.log(resolveVault(t1).address.toRawString());

        expect((await pool.getJettonData()).totalSupply).toBe(toNano(2));
        expect(await getUserLp(user.address, pool)).toBe(toNano(2) - 1_000n);

        expect(txs.transactions).toHaveTransaction(
            {
                from: await factory.getLiquidityDepositoryAddress(
                    user.address,
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                ),
                to: pool.address,
                success: true,
                exitCode: 0
            }
        )
        if (idx == 0) {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: pool.address,
                    to: resolveVault(t1).address,
                    success: true,
                    exitCode: 0
                }
            )
            expect(txs.transactions)
                .not
                .toHaveTransaction(
                    {
                        from: pool.address,
                        to: resolveVault(t2).address,
                    }
                )
        } else {
            expect(txs.transactions).toHaveTransaction(
                {
                    from: pool.address,
                    to: resolveVault(t2).address,
                    success: true,
                    exitCode: 0
                }
            )
            expect(txs.transactions)
                .not
                .toHaveTransaction(
                    {
                        from: pool.address,
                        to: resolveVault(t1).address,
                    }
                )
        }
    });

    test.each([
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.NATIVE_VAULT],
        [VaultTypes.JETTON_VAULT_2, VaultTypes.JETTON_VAULT_1],
    ])
    ('second deposit, no any token refund, success, %i, %i', async (t1, t2) => {
        // stage deploy
        // token1: deposit 1
        // token1: deposit 1

        // stage deposit
        // token1: deposit 1
        // token1: deposit 1
        // no refund

        await createPool(user,
            resolveVault(t1),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
            )
        );
        await createPool(user,
            resolveVault(t2),
            toNano(1),
            new PoolParams(
                await resolveVault(t1).getAssetParsed(),
                await resolveVault(t2).getAssetParsed(),
                AMM.ConstantProduct
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

        let txs = await depositLiquidity(user, resolveVault(t1), toNano(1),
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
        printTransactions(txs.transactions);
        txs = await depositLiquidity(user, resolveVault(t2), toNano(1),
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
        printTransactions(txs.transactions);
        expect((await pool.getJettonData()).totalSupply).toBe(toNano(1) * 2n);
        expect(await getUserLp(user.address, pool)).toBe(toNano(1) - 1_000n + toNano(1))
        expect(txs.transactions).toHaveTransaction(
            {
                from: await factory.getLiquidityDepositoryAddress(
                    user.address,
                    await resolveVault(t1).getAssetParsed(),
                    await resolveVault(t2).getAssetParsed(),
                    AMM.ConstantProduct
                ),
                to: pool.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).not.toHaveTransaction(
            {
                from: pool.address,
                to: resolveVault(t1).address,
            }
        )
        expect(txs.transactions)
            .not
            .toHaveTransaction(
                {
                    from: pool.address,
                    to: resolveVault(t2).address,
                }
            )
    });
});
