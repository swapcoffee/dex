import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultJetton} from "../wrappers/VaultJetton";
import {AMM, DepositLiquidityParams, DepositLiquidityParamsTrimmed, PoolParams} from "../wrappers/types";
import {CodeCells, compileCodes, deployJetton, lpWalletCode} from "./utils";
import {LiquidityDepository} from "../wrappers/LiquidityDepository";
import {printTransactions} from "../wrappers/utils";

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

        let jettonWallet1Admin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(admin.address))
        );
        let jettonWallet2Admin = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster2.getWalletAddress(admin.address))
        );

        await jettonWallet1Admin.sendTransfer(admin.getSender(), toNano('0.5'), user.address, toNano('50'));
        await jettonWallet2Admin.sendTransfer(admin.getSender(), toNano('0.5'), user.address, toNano('50'));
    });

    test.each([['admin'], ['user']])('deposit liquidity jetton+jetton, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let senderAddressJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(sender.address))
        );
        let senderAddressJettonWallet2 = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster2.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jettonMaster1.address, jettonMaster2.address, AMM.ConstantProduct)
        )

        let txs = await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano(1),
            jettonVault1.address,
            toNano(10),
            param
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: await jettonMaster1.getWalletAddress(jettonVault1.address),
            to: jettonVault1.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jettonVault1.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        let depositoryAddress = await factory.getLiquidityDepositoryAddress(sender.address, jettonMaster2.address, jettonMaster1.address, AMM.ConstantProduct);
        console.log(depositoryAddress.toRawString());
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: depositoryAddress,
            exitCode: 0,
            success: true
        });

        txs = await senderAddressJettonWallet2.sendDepositLiquidityJetton(sender.getSender(),
            toNano(1),
            jettonVault2.address,
            toNano(11),
            param
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: await jettonMaster2.getWalletAddress(jettonVault2.address),
            to: jettonVault2.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jettonVault2.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getLiquidityDepositoryAddress(sender.address, jettonMaster2.address, jettonMaster1.address, AMM.ConstantProduct),
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: await factory.getLiquidityDepositoryAddress(sender.address, jettonMaster2.address, jettonMaster1.address, AMM.ConstantProduct),
            to: await factory.getPoolAddress(jettonMaster2.address, jettonMaster1.address, AMM.ConstantProduct),
            success: false // because un-init
        });
    });

    test.each([['admin'], ['user']])('deposit liquidity jetton+native, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let senderAddressJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct)
        )

        let txs = await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano('1'),
            jettonVault1.address,
            toNano('10'),
            param
        );
        expect(txs.transactions).toHaveTransaction({
            from: await jettonMaster1.getWalletAddress(jettonVault1.address),
            to: jettonVault1.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jettonVault1.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct),
            exitCode: 0,
            success: true
        });

        txs = await nativeVault.sendDepositLiquidityNative(sender.getSender(),
            toNano('11'),
            toNano('10'),
            param
        );
        expect(txs.transactions).toHaveTransaction({
            from: sender.getSender().address,
            to: nativeVault.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: nativeVault.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct),
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct),
            to: await factory.getPoolAddress(null, jettonMaster1.address, AMM.ConstantProduct),
            success: false // because un-init
        });
    });

    test.each([['admin'], ['user']])('deposit liquidity jetton, withdraw by owner, ok, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let senderAddressJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMaster1.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct)
        )

        await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano('1'),
            jettonVault1.address,
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct))
        );

        let txs = await depository.sendWithdrawFunds(sender.getSender(), toNano('1.0'));
        expect(txs.transactions).toHaveTransaction(
            {
                from: sender.address,
                to: depository.address,
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: depository.address,
                to: jettonVault1.address,
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: jettonVault1.address,
                to: await jettonMaster1.getWalletAddress(jettonVault1.address),
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: await jettonMaster1.getWalletAddress(jettonVault1.address),
                to: await jettonMaster1.getWalletAddress(sender.address),
                success: true,
                exitCode: 0
            }
        );
    });

    test.each([['admin'], ['user']])('deposit liquidity native, withdraw by owner, ok, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct)
        )

        await nativeVault.sendDepositLiquidityNative(sender.getSender(),
            toNano('11'),
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct))
        );

        let txs = await depository.sendWithdrawFunds(sender.getSender(), toNano('1.0'));
        expect(txs.transactions).toHaveTransaction(
            {
                from: sender.address,
                to: depository.address,
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: depository.address,
                to: nativeVault.address,
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: nativeVault.address,
                to: sender.address,
                success: true,
                exitCode: 0
            }
        );
    });

    test.each([['admin'], ['user']])('deposit liquidity native, withdraw by thief, fail, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let nonOwner: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            nonOwner = user;
        } else {
            nonOwner = admin;
        }

        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jettonMaster1.address, null, AMM.ConstantProduct)
        )

        await nativeVault.sendDepositLiquidityNative(sender.getSender(),
            toNano('11'),
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jettonMaster1.address, AMM.ConstantProduct))
        );

        let txs = await depository.sendWithdrawFunds(nonOwner.getSender(), toNano('1.0'));
        expect(txs.transactions).toHaveTransaction(
            {
                from: nonOwner.address,
                to: depository.address,
                success: false,
                exitCode: 252
            }
        );
    });
});
