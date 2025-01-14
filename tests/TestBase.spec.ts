import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {getTransactionAccount, printTransactions} from "../wrappers/utils";
import {VaultJetton} from "../wrappers/VaultJetton";
import {AMM, AssetJetton, AssetNative, PoolParams} from "../wrappers/types";
import {Pool} from "../wrappers/Pool";
import {CodeCells, compileCodes} from "./utils";
import {PoolConstantProduct} from "../wrappers/PoolConstantProduct";

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;
    let vaultNative: SandboxContract<VaultNative>;
    beforeAll(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});
        console.log('admin address = ', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        console.log('factory address = ', factory.address.toRawString());
        await factory.sendDeploy(admin.getSender(), toNano(1.0));
        console.log('---- factory.sendCreateVaultNative ----');
        const res = await factory.sendCreateVault(admin.getSender(), toNano(.05), null);
        printTransactions(res.transactions);
        vaultNative = blockchain.openContract(
            VaultNative.createFromAddress(getTransactionAccount(res.transactions[2])!)
        );
        console.log('vault_native address = ', vaultNative.address.toRawString());
        console.log(
            'balances #1',
            (await blockchain.getContract(factory.address)).balance,
            (await blockchain.getContract(vaultNative.address)).balance,
            (await blockchain.getContract(admin.address)).balance,
        );
    });
    it('get methods', async () => {
        expect(await vaultNative.getIsActive()).toBe(-1n);
        let asset = await vaultNative.getAsset();
        expect(asset.loadUint(2)).toBe(0);
    });
    it('deploy', async () => {
        const jettonMaster = blockchain.openContract(
            JettonMaster.createFromConfig({owner: admin.address, name: "TST"})
        );
        console.log('jetton master address = ', jettonMaster.address.toRawString());
        console.log('---- jettonMaster.sendDeploy ----');
        await jettonMaster.sendDeploy(admin.getSender(), toNano(1.0));
        console.log('---- jettonMaster.mint ----');
        let res = await jettonMaster.sendMint(admin.getSender(), toNano(.05), admin.address, toNano(100.0));
        const jettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(getTransactionAccount(res.transactions[2])!)
        )

        console.log('---- factory.sendCreateVaultJetton ----');
        res = await factory.sendCreateVault(admin.getSender(), toNano(.05), jettonMaster.address);
        printTransactions(res.transactions)
        const vaultJetton = blockchain.openContract(
            VaultJetton.createFromAddress(getTransactionAccount(res.transactions[2])!)
        );
        console.log('vault_jetton address = ', vaultJetton.address.toRawString());
        console.log(
            'balances #2',
            (await blockchain.getContract(factory.address)).balance,
            (await blockchain.getContract(vaultNative.address)).balance,
            (await blockchain.getContract(vaultJetton.address)).balance,
            (await blockchain.getContract(admin.address)).balance,
        );
        console.log('---- vault.sendCreatePoolNative ----');
        let res1 = await vaultNative.sendCreatePoolNative(
            admin.getSender(),
            toNano(5.0),
            toNano(4.0),
            new PoolParams(AssetNative.INSTANCE, AssetJetton.fromAddress(jettonMaster.address), AMM.ConstantProduct),
            null,
            null
        );

        printTransactions(res1.transactions);
        console.log('---- vault.sendCreatePoolJetton ----');
        await new Promise(r => setTimeout(r, 2000));
        let res2 = await jettonWallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            vaultJetton.address,
            toNano(10.0),
            new PoolParams(AssetNative.INSTANCE, AssetJetton.fromAddress(jettonMaster.address), AMM.ConstantProduct),
            null,
            null
        );
        printTransactions(res2.transactions);
        const poolAddress = getTransactionAccount(res2.transactions[8])!
        console.log('pool address = ', poolAddress.toRawString());
        console.log(
            'balances #3',
            (await blockchain.getContract(factory.address)).balance,
            (await blockchain.getContract(vaultNative.address)).balance,
            (await blockchain.getContract(vaultJetton.address)).balance,
            (await blockchain.getContract(poolAddress)).balance,
            (await blockchain.getContract(admin.address)).balance,
        );
        const pool = blockchain.openContract(
            PoolConstantProduct.createFromAddress(poolAddress)
        );
        // blockchain.verbosity = {
        //     print: true,
        //     blockchainLogs: true,
        //     vmLogs: 'vm_logs_verbose',
        //     debugLogs: true
        // };
        res = await pool.sendProvideWalletAddress(admin.getSender(), toNano(1.0), admin.address);
        printTransactions(res.transactions);
    });
});
