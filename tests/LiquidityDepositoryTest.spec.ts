import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonWallet} from "../wrappers/Jetton";
import {AMM, DepositLiquidityParams, DepositLiquidityParamsTrimmed, PoolParams} from "../wrappers/types";
import {CodeCells, compileCodes} from "./utils";
import {LiquidityDepository} from "../wrappers/LiquidityDepository";
import {printTransactions} from "../wrappers/utils";
import { deployJettonWithVault, deployNativeVault, JettonDataWithVault } from './helpers';

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jetton1: JettonDataWithVault
    let jetton2: JettonDataWithVault
    let nativeVault: SandboxContract<VaultNative>;

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
            toNano(.5),
            user.address,
            toNano(50)
        )
        await jetton2.wallet.sendTransfer(
            admin.getSender(),
            toNano(.5),
            user.address,
            toNano(50)
        )
    });

    test.each([['admin'], ['user']])('deposit liquidity jetton+jetton, %s', async (by) => {
        let sender: SandboxContract<TreasuryContract>;
        if (by == 'admin') {
            sender = admin;
        } else {
            sender = user;
        }

        let senderAddressJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(await jetton1.master.getWalletAddress(sender.address))
        );
        let senderAddressJettonWallet2 = blockchain.openContract(
            JettonWallet.createFromAddress(await jetton2.master.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jetton1.master.address, jetton2.master.address, AMM.ConstantProduct)
        )

        let txs = await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano(1),
            jetton1.vault.address,
            toNano(10),
            param
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: await jetton1.master.getWalletAddress(jetton1.vault.address),
            to: jetton1.vault.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jetton1.vault.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        let depositoryAddress = await factory.getLiquidityDepositoryAddress(sender.address, jetton2.master.address, jetton1.master.address, AMM.ConstantProduct);
        console.log(depositoryAddress.toRawString());
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: depositoryAddress,
            exitCode: 0,
            success: true
        });

        txs = await senderAddressJettonWallet2.sendDepositLiquidityJetton(sender.getSender(),
            toNano(1),
            jetton2.vault.address,
            toNano(11),
            param
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction({
            from: await jetton2.master.getWalletAddress(jetton2.vault.address),
            to: jetton2.vault.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jetton2.vault.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getLiquidityDepositoryAddress(sender.address, jetton2.master.address, jetton1.master.address, AMM.ConstantProduct),
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: await factory.getLiquidityDepositoryAddress(sender.address, jetton2.master.address, jetton1.master.address, AMM.ConstantProduct),
            to: await factory.getPoolAddress(jetton2.master.address, jetton1.master.address, AMM.ConstantProduct),
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
            JettonWallet.createFromAddress(await jetton1.master.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jetton1.master.address, null, AMM.ConstantProduct)
        )

        let txs = await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano('1'),
            jetton1.vault.address,
            toNano('10'),
            param
        );
        expect(txs.transactions).toHaveTransaction({
            from: await jetton1.master.getWalletAddress(jetton1.vault.address),
            to: jetton1.vault.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jetton1.vault.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct),
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
            to: await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct),
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct),
            to: await factory.getPoolAddress(null, jetton1.master.address, AMM.ConstantProduct),
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
            JettonWallet.createFromAddress(await jetton1.master.getWalletAddress(sender.address))
        );
        let param = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(jetton1.master.address, null, AMM.ConstantProduct)
        )

        await senderAddressJettonWallet1.sendDepositLiquidityJetton(sender.getSender(),
            toNano('1'),
            jetton1.vault.address,
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct))
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
                to: jetton1.vault.address,
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: jetton1.vault.address,
                to: await jetton1.master.getWalletAddress(jetton1.vault.address),
                success: true,
                exitCode: 0
            }
        );
        expect(txs.transactions).toHaveTransaction(
            {
                from: await jetton1.master.getWalletAddress(jetton1.vault.address),
                to: await jetton1.master.getWalletAddress(sender.address),
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
            PoolParams.fromAddress(jetton1.master.address, null, AMM.ConstantProduct)
        )

        await nativeVault.sendDepositLiquidityNative(sender.getSender(),
            toNano('11'),
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct))
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
            PoolParams.fromAddress(jetton1.master.address, null, AMM.ConstantProduct)
        )

        await nativeVault.sendDepositLiquidityNative(sender.getSender(),
            toNano('11'),
            toNano('10'),
            param
        );
        let depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct))
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

    test.each(['native', 'jetton'])('double deposit %s, then withdraw', async (type) => {
        const sender = user
        const params = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                0n,
                sender.address,
                null,
                null
            ),
            PoolParams.fromAddress(null, jetton1.master.address, AMM.ConstantProduct)
        )
        let sendTx, vault
        if (type === 'native') {
            sendTx = async () => nativeVault.sendDepositLiquidityNative(
                sender.getSender(),
                toNano(11),
                toNano(10),
                params
            )
            vault = nativeVault
        } else {
            const senderAddressJettonWallet1 = blockchain.openContract(
                JettonWallet.createFromAddress(await jetton1.master.getWalletAddress(sender.address))
            )
            sendTx = async() => senderAddressJettonWallet1.sendDepositLiquidityJetton(
                sender.getSender(),
                toNano(1),
                jetton1.vault.address,
                toNano(10),
                params
            )
            vault = jetton1.vault
        }
        await sendTx()
        const depository = blockchain.openContract(
            LiquidityDepository.createFromAddress(
                await factory.getLiquidityDepositoryAddress(sender.address, null, jetton1.master.address, AMM.ConstantProduct)
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
            const vaultWalletAddress = await jetton1.master.getWalletAddress(vault.address)
            const senderWalletAddress = await jetton1.master.getWalletAddress(sender.address)
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
});
