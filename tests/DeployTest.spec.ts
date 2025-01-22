import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {getTransactionAccount, printTransactions} from "../wrappers/utils";
import {VaultJetton} from "../wrappers/VaultJetton";
import {AMM, PoolParams} from "../wrappers/types";
import {CodeCells, compileCodes, deployJetton} from "./utils";

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});
        console.log('admin address =', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        console.log('factory address =', factory.address.toRawString());
        await factory.sendDeploy(admin.getSender(), toNano(1.0));
    });

    it('deploy vault jetton', async () => {
        let deploy = await deployJetton(blockchain, admin, "TST");
        const jettonMaster = deploy.master;

        console.log('---- factory.sendCreateVaultJetton ----');
        // blockchain.verbosity = {
        //     print: true,
        //     blockchainLogs: true,
        //     vmLogs: 'vm_logs_gas',
        //     debugLogs: true
        // };
        let res = await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster.address);
        printTransactions(res.transactions)
        const vaultJetton = blockchain.openContract(
            VaultJetton.createFromAddress(getTransactionAccount(res.transactions[2])!)
        );
        console.log('vault_jetton address =', vaultJetton.address.toRawString());

        expect((await factory.getVaultAddress(jettonMaster.address)).toRawString())
            .toBe(vaultJetton.address.toRawString());

        expect(res.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        });
        expect(res.transactions).toHaveTransaction({
            from: factory.address,
            to: vaultJetton.address,
            success: true,
            exitCode: 0
        });
        expect(res.transactions).toHaveTransaction({
            from: vaultJetton.address,
            to: jettonMaster.address,
            success: true,
            exitCode: 0,
            op: 0x2c76b973
        });
        expect(res.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: vaultJetton.address,
            success: true,
            exitCode: 0,
            op: 0xd1735400
        });
        // 4 + 1
        expect(res.transactions.length).toBe(5);
    });

    it('deploy vault native', async () => {
        console.log('---- factory.sendCreateVaultJetton ----');
        let res = await factory.sendCreateVault(admin.getSender(), toNano(.04), null);
        printTransactions(res.transactions)
        const vaultJetton = blockchain.openContract(
            VaultJetton.createFromAddress(getTransactionAccount(res.transactions[2])!)
        );
        console.log('native_vault_jetton address =', vaultJetton.address.toRawString());
        expect((await factory.getVaultAddress(null)).toRawString())
            .toBe(vaultJetton.address.toRawString());

        expect(res.transactions).toHaveTransaction({
            from: admin.address,
            to: factory.address,
            success: true,
            exitCode: 0
        });
        expect(res.transactions).toHaveTransaction({
            from: factory.address,
            to: vaultJetton.address,
            success: true,
            exitCode: 0
        });
        // 2 + 1
        expect(res.transactions.length).toBe(3);
    });

    it('deploy pool jetton+native stable', async () => {
        let deploy = await deployJetton(blockchain, admin, "TST");
        const jettonMaster = deploy.master;
        const jettonWallet = deploy.jettonWallet;
        (await factory.sendCreateVault(admin.getSender(), toNano(.04), null)).transactions;
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster.address);

        const vaultJetton = blockchain.openContract(
            VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster.address))
        );

        const vaultNative = blockchain.openContract(
            VaultNative.createFromAddress(await factory.getVaultAddress(null))
        );

        const ammSettings = beginCell()
            .storeUint(2_000, 16)
            .storeCoins(1)
            .storeCoins(1)
            .endCell()

        let txs = await jettonWallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            vaultJetton.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster.address, null, AMM.CurveFiStable),
            ammSettings,
            null
        );

        let address1 = await factory.getPoolAddress(jettonMaster.address, null, AMM.CurveFiStable);
        let address2 = await factory.getPoolAddress(null, jettonMaster.address, AMM.CurveFiStable);

        expect(address1.toRawString()).toBe(address2.toRawString());
        expect(txs.transactions).toHaveTransaction({
            to: vaultJetton.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: vaultJetton.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });

        txs = await vaultNative.sendCreatePoolNative(
            admin.getSender(),
            toNano(5.0),
            toNano(4.0),
            admin.address,
            PoolParams.fromAddress(null, jettonMaster.address, AMM.CurveFiStable),
            ammSettings,
            null
        );

        expect(txs.transactions).toHaveTransaction({
            to: vaultNative.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: vaultNative.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: factory.address,
            to: address1,
            exitCode: 0,
            success: true
        });
    });

    it('deploy pool jetton+jetton', async () => {
        let deploy = await deployJetton(blockchain, admin, "TST");
        const jettonMaster = deploy.master;
        const jettonWallet = deploy.jettonWallet;
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster.address);

        deploy = await deployJetton(blockchain, admin, "TST2");
        const jettonMaster2 = deploy.master;
        const jettonWallet2 = deploy.jettonWallet;
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster2.address);

        const vaultJetton1 = blockchain.openContract(
            VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster.address))
        );

        const vaultJetton2 = blockchain.openContract(
            VaultNative.createFromAddress(await factory.getVaultAddress(jettonMaster2.address))
        );

        let txs = await jettonWallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            vaultJetton1.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );

        let address1 = await factory.getPoolAddress(jettonMaster.address, jettonMaster2.address, AMM.ConstantProduct);
        let address2 = await factory.getPoolAddress(jettonMaster2.address, jettonMaster.address, AMM.ConstantProduct);

        expect(address1.toRawString()).toBe(address2.toRawString());
        expect(txs.transactions).toHaveTransaction({
            to: vaultJetton1.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: vaultJetton1.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });

        txs = await jettonWallet2.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            vaultJetton2.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jettonMaster.address, jettonMaster2.address, AMM.ConstantProduct),
            null,
            null
        );
        printTransactions(txs.transactions);

        expect(txs.transactions).toHaveTransaction({
            to: vaultJetton2.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: vaultJetton2.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            to: address1,
            exitCode: 0,
            success: true
        });
    });

    it('failed to resolve pool for the same jetton masters', async () => {
        let deploy = await deployJetton(blockchain, admin, "TST");
        const jettonMaster = deploy.master;
        let func = async () => factory.getPoolAddress(
            jettonMaster.address,
            jettonMaster.address,
            AMM.ConstantProduct
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 257");
    });
});