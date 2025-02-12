import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultJetton} from "../wrappers/VaultJetton";
import { AMM, DepositLiquidityParams, DepositLiquidityParamsTrimmed, PoolParams } from '../wrappers/types';
import {CodeCells, compileCodes, deployJetton} from "./utils";
import {AccountStateActive} from "@ton/core/src/types/AccountState";
import {PoolCreator} from "../wrappers/PoolCreator";
import { LiquidityDepository } from '../wrappers/LiquidityDepository';
import { printTransactions } from '../wrappers/utils';

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jettonMaster1: SandboxContract<JettonMaster>;
    let jettonMaster2: SandboxContract<JettonMaster>;

    let nativeVault: SandboxContract<VaultNative>;
    let jettonVault1: SandboxContract<VaultJetton>;
    let jettonVault2: SandboxContract<VaultJetton>;

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

        let deploy = await deployJetton(blockchain, admin, "TST");
        jettonMaster1 = deploy.master;

        deploy = await deployJetton(blockchain, admin, "TST2");
        jettonMaster2 = deploy.master;

        await factory.sendCreateVault(admin.getSender(), toNano(.04), null);
        nativeVault = blockchain.openContract(
            VaultNative.createFromAddress(await factory.getVaultAddress(null))
        );

        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster1.address);
        jettonVault1 = blockchain.openContract(
            VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address))
        );

        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster2.address);
        jettonVault2 = blockchain.openContract(
            VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster2.address))
        );

    });

    it('pool_creator jetton+jetton created/destroyed, admin', async () => {
        let jettonWallet1Admin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        let jettonWallet2Admin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster2.getWalletAddress(admin.address))
        );

        let txs = await jettonWallet1Admin.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        txs = await jettonWallet2Admin.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jettonVault2.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );

        // check balance = 0 & uninitialized
        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
    });

    it('pool_creator jetton+jetton created/destroyed, user', async () => {
        let jettonWalletAdmin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        await jettonWalletAdmin.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(10.0)
        );

        jettonWalletAdmin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster2.getWalletAddress(admin.address))
        );
        await jettonWalletAdmin.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(10.0)
        );

        let jettonWallet1User = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(user.address))
        );
        let jettonWallet2User = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster2.getWalletAddress(user.address))
        );

        let txs = await jettonWallet1User.sendCreatePoolJetton(
            user.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        txs = await jettonWallet2User.sendCreatePoolJetton(
            user.getSender(),
            toNano(1.0),
            jettonVault2.address,
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );

        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
    });

    it('pool_creator jetton+native stable created/destroyed, admin', async () => {
        let jettonWallet1Admin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        const ammSettings = beginCell()
            .storeUint(100, 16)
            .storeCoins(0)
            .storeCoins(0)
            .endCell()
        let txs = await jettonWallet1Admin.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.CurveFiStable),
            ammSettings,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable),
                exitCode: 0,
                success: true
            }
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, null, jettonMaster1.address, AMM.CurveFiStable)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        txs = await nativeVault.sendCreatePoolNative(
            admin.getSender(),
            toNano(11.0),
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(null, jettonMaster1.address, AMM.CurveFiStable),
            ammSettings,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable),
                exitCode: 0,
                success: true
            }
        );

        // check balance = 0 & uninitialized
        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
    });

    it('pool_creator jetton+native created/destroyed, user', async () => {
        let jettonWalletAdmin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        await jettonWalletAdmin.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(10.0)
        );

        let jettonWallet1User = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(user.address))
        );

        let txs = await jettonWallet1User.sendCreatePoolJetton(
            user.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        txs = await nativeVault.sendCreatePoolNative(
            user.getSender(),
            toNano(11.0),
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct),
            null,
            null
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct),
                exitCode: 0,
                success: true
            }
        );

        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
    });

    it('pool_creator jetton+native try withdraw jetton funds by user, ok', async () => {
        let jettonWalletAdmin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        await jettonWalletAdmin.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(10.0)
        );

        let jettonWallet1User = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(user.address))
        );
        let userBalanceBefore = await jettonWallet1User.getWalletBalance();

        await jettonWallet1User.sendCreatePoolJetton(
            user.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct),
            null,
            null
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        let userBalanceAfterDeposit = await jettonWallet1User.getWalletBalance();
        expect(userBalanceAfterDeposit + toNano(10.0)).toBe(userBalanceBefore);

        let poolCreator = blockchain.openContract(PoolCreator.createFromAddress(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        ));

        let txs = await poolCreator.sendWithdrawFunds(user.getSender(), toNano(1.0));
        expect(txs.transactions).toHaveTransaction({
            from: user.address,
            to: poolCreator.address,
            exitCode: 0,
            success: true
        });

        expect(txs.transactions).toHaveTransaction({
            from: jettonWallet1User.address,
            to: user.address,
            exitCode: 0,
            success: true
        });

        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
        expect(await jettonWallet1User.getWalletBalance()).toBe(userBalanceBefore);
    });

    it('pool_creator jetton+native try withdraw jetton funds by non user, failed', async () => {
        let jettonWalletAdmin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        await jettonWalletAdmin.sendTransfer(
            admin.getSender(),
            toNano(1.0),
            user.address,
            toNano(10.0)
        );

        let jettonWallet1User = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(user.address))
        );
        let userBalanceBefore = await jettonWallet1User.getWalletBalance();

        await jettonWallet1User.sendCreatePoolJetton(
            user.getSender(),
            toNano(1.0),
            jettonVault1.address,
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct),
            null,
            null
        );
        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        let userBalanceAfterDeposit = await jettonWallet1User.getWalletBalance();
        expect(userBalanceAfterDeposit + toNano(10.0)).toBe(userBalanceBefore);

        let poolCreator = blockchain.openContract(PoolCreator.createFromAddress(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        ));

        let txs = await poolCreator.sendWithdrawFunds(admin.getSender(), toNano(1.0));
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: poolCreator.address,
            exitCode: 252,
            success: false
        });
    });

    it('pool_creator jetton+native stable try withdraw native funds by admin, ok', async () => {
        const ammSettings = beginCell()
            .storeUint(100, 16)
            .storeCoins(0)
            .storeCoins(0)
            .endCell()
        await nativeVault.sendCreatePoolNative(
            admin.getSender(),
            toNano(11.0),
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.CurveFiStable),
            ammSettings,
            null
        );

        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        let poolCreator = blockchain.openContract(PoolCreator.createFromAddress(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable)
        ));

        let txs = await poolCreator.sendWithdrawFunds(admin.getSender(), toNano(1.0));
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: poolCreator.address,
            exitCode: 0,
            success: true
        });

        expect(txs.transactions).toHaveTransaction({
            from: nativeVault.address,
            to: admin.address,
            exitCode: 0,
            success: true
        });

        state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(admin.address, jettonMaster1.address, null, AMM.CurveFiStable)
        );
        expect(state.balance).toBe(0n);
        expect(state.accountState).toBe(undefined);
    });

    it('pool_creator jetton+native stable try create pool by user, fail, user lost money', async () => {
        const ammSettings = beginCell()
            .storeUint(100, 16)
            .storeCoins(0)
            .storeCoins(0)
            .endCell()
        let txs = await nativeVault.sendCreatePoolNative(
            user.getSender(),
            toNano(11.0),
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.CurveFiStable),
            ammSettings,
            null
        );

        expect(txs.transactions).toHaveTransaction(
            {
                from: user.address,
                to: nativeVault.address,
                exitCode: 0,
                success: true
            }
        )

        expect(txs.transactions).toHaveTransaction(
            {
                from: nativeVault.address,
                to: factory.address,
                exitCode: 254,
                success: false
            }
        )

    });

    it('pool_creator jetton+native try withdraw native funds by non user, failed', async () => {
        await nativeVault.sendCreatePoolNative(
            user.getSender(),
            toNano(11.0),
            toNano(10.0),
            user.address,
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct),
            null,
            null
        );

        let state = await blockchain.getContract(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        );
        expect(state.balance).not.toBe(0n);
        expect((state.accountState as AccountStateActive).type).toBe('active');

        let poolCreator = blockchain.openContract(PoolCreator.createFromAddress(
            await factory.getPoolCreatorAddress(user.address, jettonMaster1.address, null, AMM.ConstantProduct)
        ));

        let txs = await poolCreator.sendWithdrawFunds(admin.getSender(), toNano(1.0));
        expect(txs.transactions).toHaveTransaction({
            from: admin.address,
            to: poolCreator.address,
            exitCode: 252,
            success: false
        });
    });

    test.each(['native', 'jetton'])('double deposit %s, then withdraw', async (type) => {
        const sender = admin
        let sendTx, vault
        if (type === 'native') {
            sendTx = async() => nativeVault.sendCreatePoolNative(
                sender.getSender(),
                toNano(11),
                toNano(10),
                sender.address,
                PoolParams.fromAddress(null, jettonMaster1.address, AMM.ConstantProduct),
                null,
                null
            )
            vault = nativeVault
        } else {
            const senderAddressJettonWallet1 = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(sender.address))
            )
            sendTx = async() => senderAddressJettonWallet1.sendCreatePoolJetton(
                sender.getSender(),
                toNano(1),
                jettonVault1.address,
                toNano(10),
                sender.address,
                PoolParams.fromAddress(null, jettonMaster1.address, AMM.ConstantProduct),
                null,
                null
            )
            vault = jettonVault1
        }
        await sendTx()
        const depository = blockchain.openContract(
            PoolCreator.createFromAddress(
                await factory.getPoolCreatorAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct)
            )
        )
        const depositTxs = await sendTx()
        expect(depositTxs.transactions).toHaveTransaction(
            {
                from: vault.address,
                to: factory.address,
                exitCode: 0,
                success: true
            }
        )
        expect(depositTxs.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: depository.address,
                exitCode: 264,
                success: true
            }
        )
        expect(depositTxs.transactions).toHaveTransaction(
            {
                from: depository.address,
                to: vault.address,
                exitCode: 0,
                success: true
            }
        )
        const withdrawTxs = await depository.sendWithdrawFunds(sender.getSender(), toNano(1))
        expect(withdrawTxs.transactions).toHaveTransaction(
            {
                from: depository.address,
                to: vault.address,
                exitCode: 0,
                success: true
            }
        )
        if (type === 'native') {
            expect(depositTxs.transactions).toHaveTransaction(
                {
                    from: vault.address,
                    to: sender.address,
                    exitCode: 0,
                    success: true
                }
            )
            expect(withdrawTxs.transactions).toHaveTransaction(
                {
                    from: vault.address,
                    to: sender.address,
                    exitCode: 0,
                    success: true
                }
            )
        } else {
            const vaultWalletAddress = await jettonMaster1.getWalletAddress(vault.address)
            const senderWalletAddress = await jettonMaster1.getWalletAddress(sender.address)
            expect(depositTxs.transactions).toHaveTransaction(
                {
                    from: vault.address,
                    to: vaultWalletAddress,
                    exitCode: 0,
                    success: true
                }
            )
            expect(depositTxs.transactions).toHaveTransaction(
                {
                    from: vaultWalletAddress,
                    to: senderWalletAddress,
                    exitCode: 0,
                    success: true
                }
            )
            expect(withdrawTxs.transactions).toHaveTransaction(
                {
                    from: vault.address,
                    to: vaultWalletAddress,
                    exitCode: 0,
                    success: true
                }
            )
            expect(withdrawTxs.transactions).toHaveTransaction(
                {
                    from: vaultWalletAddress,
                    to: senderWalletAddress,
                    exitCode: 0,
                    success: true
                }
            )
        }
    })

    test.each(
        [
            ['stable', 'native'],
            ['stable', 'jetton'],
            ['volatile', 'jetton'],
            ['volatile', 'native'],
        ],
    )('try create jetton+native pool: %s, first: %s, by admin in favor of user, ok', async (type, order) => {
        let ammType;
        let ammSettings;
        if(type === 'stable') {
            ammType = AMM.CurveFiStable;
            ammSettings = beginCell()
                .storeUint(100, 16)
                .storeCoins(1)
                .storeCoins(1)
                .endCell()

        } else {
            ammType = AMM.ConstantProduct;
            ammSettings = null;
        }

        const depository = blockchain.openContract(
            PoolCreator.createFromAddress(
                await factory.getPoolCreatorAddress(user.address, null, jettonMaster1.address, ammType)
            )
        )

        let tx1;
        let tx2;

        let initiator1;
        let initiator2;
        if(order === 'native') {
            initiator1 = nativeVault.address;
            initiator2 = jettonVault1.address;
            tx1 = await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(11),
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
            tx2 = await blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
            ).sendCreatePoolJetton(
                admin.getSender(),
                toNano(1),
                jettonVault1.address,
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        } else {
            initiator1 = jettonVault1.address;
            initiator2 = nativeVault.address;
            tx1 = await blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
            ).sendCreatePoolJetton(
                admin.getSender(),
                toNano(1),
                jettonVault1.address,
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
            tx2 = await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(11),
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        }



        expect(tx1.transactions).toHaveTransaction(
            {
                from: initiator1,
                to: factory.address,
                exitCode: 0,
                success: true
            }
        )

        expect(tx1.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: depository.address,
                exitCode: 0,
                success: true
            }
        )

        expect(tx2.transactions).toHaveTransaction(
            {
                from: initiator2,
                to: factory.address,
                exitCode: 0,
                success: true
            }
        )

        expect(tx2.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: depository.address,
                exitCode: 0,
                success: true
            }
        )

        expect(tx2.transactions).toHaveTransaction(
            {
                from: depository.address,
                to: factory.address,
                exitCode: 0,
                success: true
            }
        )

        expect(tx2.transactions).toHaveTransaction(
            {
                from: factory.address,
                to: await factory.getPoolAddress(null, jettonMaster1.address, ammType),
                exitCode: 0,
                success: true
            }
        )

        let userPoolWallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(await factory.getPoolAddress(null, jettonMaster1.address, ammType))
                ).getWalletAddress(user.address)
            )
        );

        expect(await userPoolWallet.getWalletBalance()).toBeGreaterThan(100n);

    })

    test.each(
        [
            ['stable', 'native'],
            ['stable', 'jetton'],
            ['volatile', 'jetton'],
            ['volatile', 'native'],
        ],
    )('try withdraw funds jetton+native pool: %s, first: %s, by admin in favor of user, by admin, fail', async (type, order) => {
        let ammType;
        let ammSettings;
        if(type === 'stable') {
            ammType = AMM.CurveFiStable;
            ammSettings = beginCell()
                .storeUint(100, 16)
                .storeCoins(1)
                .storeCoins(1)
                .endCell()

        } else {
            ammType = AMM.ConstantProduct;
            ammSettings = null;
        }

        const depository = blockchain.openContract(
            PoolCreator.createFromAddress(
                await factory.getPoolCreatorAddress(user.address, null, jettonMaster1.address, ammType)
            )
        )
        if(order === 'native') {
            await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(11),
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        } else {
            await blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
            ).sendCreatePoolJetton(
                admin.getSender(),
                toNano(1),
                jettonVault1.address,
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        }
        let withdrawTx = await depository.sendWithdrawFunds(admin.getSender(), toNano(1));
        expect(withdrawTx.transactions).toHaveTransaction(
            {
                from: admin.getSender().address,
                to: depository.address,
                exitCode: 252,
                success: false,
            }
        )
    })

    test.each(
        [
            ['stable', 'native'],
            ['stable', 'jetton'],
            ['volatile', 'jetton'],
            ['volatile', 'native'],
        ],
    )('try withdraw funds jetton+native pool: %s, first: %s, by admin in favor of user, by user, ok', async (type, order) => {
        let ammType;
        let ammSettings;
        if(type === 'stable') {
            ammType = AMM.CurveFiStable;
            ammSettings = beginCell()
                .storeUint(100, 16)
                .storeCoins(1)
                .storeCoins(1)
                .endCell()

        } else {
            ammType = AMM.ConstantProduct;
            ammSettings = null;
        }

        const depository = blockchain.openContract(
            PoolCreator.createFromAddress(
                await factory.getPoolCreatorAddress(user.address, null, jettonMaster1.address, ammType)
            )
        )
        if(order === 'native') {
            await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(11),
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        } else {
            await blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
            ).sendCreatePoolJetton(
                admin.getSender(),
                toNano(1),
                jettonVault1.address,
                toNano(10),
                user.address,
                PoolParams.fromAddress(null, jettonMaster1.address, ammType),
                ammSettings,
                null
            );
        }
        let withdrawTx = await depository.sendWithdrawFunds(user.getSender(), toNano(1));
        expect(withdrawTx.transactions).toHaveTransaction(
            {
                from: user.getSender().address,
                to: depository.address,
                exitCode: 0,
                success: true,
            }
        )
    })

});
