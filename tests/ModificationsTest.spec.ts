import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, Slice, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import { AMM, AssetJetton, AssetNative, Fee, Fees, PoolParams, SwapParams, SwapStepParams } from '../wrappers/types';
import {CodeCells, compileCodes} from "./utils";
import {compile} from "@ton/blueprint";
import {printTransactions} from "../wrappers/utils";
import {TestContract} from "../wrappers/unit/TestContract";
import { deployExtraVault, deployJettonWithVault, deployNativeVault, JettonDataWithVault } from './helpers';
import { VaultExtra } from '../wrappers/VaultExtra';

describe('Test', () => {
    let codeCells: CodeCells;
    let testContractCode: Cell;
    beforeAll(async () => {
        codeCells = await compileCodes();
        testContractCode = await compile("unit/TestContract");
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jetton1: JettonDataWithVault
    let jetton2: JettonDataWithVault
    let nativeVault: SandboxContract<VaultNative>
    let extraVault: SandboxContract<VaultExtra>

    let feesVariables = [
        [null as number|null, null as number|null, AMM.ConstantProduct],
        [null as number|null, null as number|null, AMM.CurveFiStable],
        [100, 200, AMM.ConstantProduct],
        [4000, 500, AMM.CurveFiStable]
    ]

    let settingsVars = [
        [null as Cell | null],
        [beginCell().endCell()],
        [beginCell().storeUint(10, 10).endCell()],
    ].map(it => {
            return [
                [it[0], AMM.ConstantProduct],
                [it[0], AMM.CurveFiStable]
            ]
        }
    ).flat();

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(1000.0)});
        user = await blockchain.treasury('user', {balance: toNano(1000.0)});
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
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
        extraVault = await deployExtraVault(blockchain, factory, admin, 8n)

        // native -> jetton1 volatile
        {
            await jetton1.wallet.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                jetton1.vault.address,
                toNano(5),
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
            await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(6),
                toNano(5),
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
        }

        // native -> jetton1 stable
        {
            await jetton1.wallet.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                jetton1.vault.address,
                toNano(5),
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
            await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(6),
                toNano(5),
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.CurveFiStable
                ),
                beginCell()
                    .storeUint(2_000, 16)
                    .storeCoins(1)
                    .storeCoins(1)
                    .endCell(),
                null
            )
        }

    });

    it('factory update admin, by non admin, fail', async () => {
        let txs = await factory.sendUpdateAdmin(user.getSender(), toNano(1), null)
        printTransactions(txs.transactions)
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: false,
            exitCode: 254
        })
    });

    it('factory update admin, by admin, ok', async () => {
        let txs = await factory.sendUpdateAdmin(admin.getSender(), toNano(1), user.address)
        printTransactions(txs.transactions)
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        let address = await factory.getAdminAddress()
        expect((address as Address).toRawString()).toBe(user.address.toRawString());

        txs = await factory.sendUpdateAdmin(user.getSender(), toNano(1), null)
        printTransactions(txs.transactions)
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        address = await factory.getAdminAddress()
        expect(address).toBe(null);
    });

    it('factory update code cell, by non admin, fail', async () => {
        let txs = await factory.sendUpdateCodeCell(user.getSender(), toNano(1), beginCell().storeUint(1, 1).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: false,
            exitCode: 254
        })
    });

    it('factory update code cell, by admin, ok', async () => {
        let txs = await factory.sendUpdateCodeCell(admin.getSender(), toNano(1), beginCell().storeUint(1, 1).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        let newCode = await factory.getCode();
        expect(newCode.toString()).toBe(
            beginCell().storeUint(1, 1).endCell().toString()
        );
    });

    it('factory update self code and data, by non admin, fail', async () => {
        let txs = await factory.sendUpdateContract(user.getSender(), toNano(1),
            null,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: false,
            exitCode: 254
        })
    });

    it('factory update self code and data, by admin, ok', async () => {
        let txs = await factory.sendUpdateContract(admin.getSender(), toNano(1),
            null,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        let contact = blockchain.openContract(TestContract.createFromAddress(factory.address));

        expect((await contact.getStoredData()).toString()).toBe(
            beginCell().storeUint(10, 10).endCell().toString()
        )
    });

    it('from factory update native vault, by admin, ok', async () => {
        let address = (await factory.getVaultAddress(null));
        let txs = await factory.sendUpdateContract(admin.getSender(), toNano(1),
            address,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: address,
            success: true,
            exitCode: 0
        })

        let contact = blockchain.openContract(TestContract.createFromAddress(address));

        expect((await contact.getStoredData()).toString()).toBe(
            beginCell().storeUint(10, 10).endCell().toString()
        )
    });

    it('from factory update jetton vault, by admin, ok', async () => {
        let address = (await factory.getVaultAddress(jetton1.master.address));
        let txs = await factory.sendUpdateContract(admin.getSender(), toNano(1),
            address,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: address,
            success: true,
            exitCode: 0
        })

        let contact = blockchain.openContract(TestContract.createFromAddress(address));

        expect((await contact.getStoredData()).toString()).toBe(
            beginCell().storeUint(10, 10).endCell().toString()
        )
    });

    it('from factory update external vault, by admin, ok', async () => {
        let address = (await factory.getVaultAddress(8n));
        let txs = await factory.sendUpdateContract(admin.getSender(), toNano(1),
            address,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: address,
            success: true,
            exitCode: 0
        })

        let contact = blockchain.openContract(TestContract.createFromAddress(address));

        expect((await contact.getStoredData()).toString()).toBe(
            beginCell().storeUint(10, 10).endCell().toString()
        )
    });

    it('from factory update pool, by admin, ok', async () => {
        let address = await factory.getPoolAddress(
            AssetNative.INSTANCE,
            AssetJetton.fromAddress(jetton1.master.address),
            AMM.ConstantProduct
        );
        let txs = await factory.sendUpdateContract(admin.getSender(), toNano(1),
            address,
            testContractCode,
            beginCell().storeUint(10, 10).endCell())
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })

        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: address,
            success: true,
            exitCode: 0
        })

        let contact = blockchain.openContract(TestContract.createFromAddress(address));

        expect((await contact.getStoredData()).toString()).toBe(
            beginCell().storeUint(10, 10).endCell().toString()
        )
    });

    it('from factory update pool, by non admin, fail', async () => {
        let txs = await factory.sendUpdatePool(user.getSender(), toNano(1),
            new PoolParams(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.ConstantProduct
            ),

            null,

            null,
            null,

            null
        )
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: false,
            exitCode: 254
        })
    });

    it('from factory update pool settings, by admin, ok', async () => {
        let fee = new Fees(
            new Fee(100n),
            new Fee(100n),
            new Fee(100n),
            new Fee(100n)
        );
        let txs = await factory.sendUpdatePool(admin.getSender(), toNano(1),
            new PoolParams(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.ConstantProduct
            ),

            null,

            null,
            null,

            null
            )
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getPoolAddress(AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.ConstantProduct),
            success: true,
            exitCode: 0
        })

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.ConstantProduct
            )
        );

        let data = await pool.getPoolData();
        expect(data.ammSettings).toBe(null);
    });

    test.each(feesVariables)
    ('update fees for pool, ok', async (protocol_fee, lp_fee, t) => {
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM
            )
        );
        let dataBefore = await pool.getPoolData();
        let txs = await factory.sendUpdatePool(admin.getSender(), toNano(1),
            new PoolParams(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM
            ),
            null,

            protocol_fee,
            lp_fee,

            null

            )
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getPoolAddress(AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM),
            success: true,
            exitCode: 0
        })


        let data = await pool.getPoolData();
        if(protocol_fee == null) {
            expect(data.protocolFee).toBe(dataBefore.protocolFee)
            expect(data.lpFee).toBe(dataBefore.lpFee)
        } else {
            expect(data.protocolFee).toBe(BigInt(protocol_fee))
            expect(data.lpFee).toBe(BigInt(lp_fee as number))
        }
    });

    test.each(settingsVars)
    ('update settings for pool, ok', async (settings, t) => {
        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM
            )
        );
        let dataBefore = await pool.getPoolData();
        let txs = await factory.sendUpdatePool(admin.getSender(), toNano(1),
            new PoolParams(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM
            ),

            settings as Cell | null,

            null,
            null,

            null
        )
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getPoolAddress(AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                t as AMM),
            success: true,
            exitCode: 0
        })

        let data = await pool.getPoolData();
        console.log(data);
        if (settings == null) {
            expect(data.ammSettings?.toString()).toBe(dataBefore.ammSettings?.toString());
        } else {
            expect(data.ammSettings?.toString()).toBe(settings?.toString());
        }
    });

    test('withdraw by non admin, fail', async () => {
        let txs = await factory.sendWithdraw(
            user.getSender(),
            toNano(1),
            await factory.getPoolAddress(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.CurveFiStable
            ),
            AssetNative.INSTANCE,
            1n,
            admin.address
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: factory.address,
            success: false,
            exitCode: 252
        })
    });

    test('withdraw by admin, ok', async () => {
        const poolAddress = await factory.getPoolAddress(
            AssetNative.INSTANCE,
            AssetJetton.fromAddress(jetton1.master.address),
            AMM.CurveFiStable
        )
        let txs = await factory.sendWithdraw(
            admin.getSender(),
            toNano(1),
            poolAddress,
            AssetNative.INSTANCE,
            1n,
            user.address
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: poolAddress,
            success: false,
            exitCode: 265
        })
        await nativeVault.sendSwapNative(
            user.getSender(),
            toNano(1.2),
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.CurveFiStable
                ),
                0n,
                null
            ),
            new SwapParams(BigInt((1 << 30) * 2), user.address, null, null)
        )
        txs = await factory.sendWithdraw(
            admin.getSender(),
            toNano(1),
            poolAddress,
            AssetNative.INSTANCE,
            toNano(.0002),
            user.address
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: poolAddress,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: poolAddress,
            to: nativeVault.address,
            success: true,
            exitCode: 0
        })
        expect(txs.transactions).toHaveTransaction({
            from: nativeVault.address,
            to: user.address,
            success: true,
            exitCode: 0
        })
    });

});
