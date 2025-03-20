import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultNative} from "../wrappers/VaultNative";
import {getTransactionAccount, printTransactions} from "../wrappers/utils";
import {
    AMM,
    AssetJetton,
    AssetNative,
    DepositLiquidityParams,
    DepositLiquidityParamsTrimmed,
    PoolParams
} from '../wrappers/types';
import {CodeCells, compileCodes} from "./utils";
import {PoolConstantProduct} from "../wrappers/PoolConstantProduct";
import { sleep } from '@ton/blueprint';
import { deployJettonWithVault } from './helpers';

xdescribe('Test', () => {
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
        admin = await blockchain.treasury('admin', {balance: toNano(100.0)});
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
    it('throw', async () => {
        const jetton1 = await deployJettonWithVault(blockchain, factory, admin, 'TST1')
        const asset1 = AssetJetton.fromAddress(jetton1.master.address)
        const asset2 = AssetNative.INSTANCE
        const amm = AMM.ConstantProduct
        const poolParams = new PoolParams(asset1, asset2, amm)
        let res = await jetton1.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton1.vault.address,
            toNano(10.0),
            admin.address,
            poolParams,
            null
        )
        printTransactions(res.transactions)
        res = await vaultNative.sendCreatePoolNative(
            admin.getSender(),
            toNano(11.0),
            toNano(10.0),
            admin.address,
            poolParams,
            null
        );
        printTransactions(res.transactions)
        // res = await vaultNative.sendSwapNative(
        //     admin.getSender(),
        //     toNano(2.0),
        //     toNano(1.999),
        //     new SwapStepParams(
        //         await factory.getPoolAddressHash(asset1, asset2, amm),
        //         0n,
        //         null
        //     ),
        //     new SwapParams(BigInt((1 << 30) * 2), admin.address, null, null)
        // );
        // res = await jetton1.wallet.sendSwapJetton(
        //     admin.getSender(),
        //     toNano(.055),
        //     jetton1.vault.address,
        //     toNano(10.0),
        //     new SwapStepParams(
        //         await factory.getPoolAddressHash(asset1, asset2, amm),
        //         0n,
        //         null
        //     ),
        //     new SwapParams(BigInt((1 << 30) * 2), admin.address, null, null)
        // );
        // printTransactions(res.transactions)
    });
    it('test_gas', async () => {
        const jetton1 = await deployJettonWithVault(blockchain, factory, admin, 'TST1')
        const jetton2 = await deployJettonWithVault(blockchain, factory, admin, 'TST2')
        const asset1 = AssetJetton.fromAddress(jetton1.master.address)
        const asset2 = AssetJetton.fromAddress(jetton2.master.address)
        const poolParams = new PoolParams(asset1, asset2, AMM.ConstantProduct)
        console.log((await blockchain.getContract(factory.address)).balance)
        await sleep(3000)
        let res = await jetton1.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton1.vault.address,
            toNano(10.0),
            admin.address,
            poolParams,
            null
        )
        printTransactions(res.transactions)
        res = await jetton2.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton2.vault.address,
            toNano(10.0),
            admin.address,
            poolParams,
            null
        )
        printTransactions(res.transactions)
        console.log((await blockchain.getContract(factory.address)).balance)
        const depositParams = new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(BigInt((1 << 30) * 2), 0n, admin.address, null, null),
            poolParams
        )
        res = await jetton1.wallet.sendDepositLiquidityJetton(
            admin.getSender(),
            toNano(1.0),
            jetton1.vault.address,
            toNano(10.0),
            depositParams
        )
        printTransactions(res.transactions)
        res = await jetton2.wallet.sendDepositLiquidityJetton(
            admin.getSender(),
            toNano(1.0),
            jetton2.vault.address,
            toNano(50.0),
            depositParams
        )
        printTransactions(res.transactions)
    });
    it('deploy', async () => {
        const jetton = await deployJettonWithVault(blockchain, factory, admin, 'TST')
        console.log('vault_jetton address = ', jetton.vault.address.toRawString());
        console.log(
            'balances #2',
            (await blockchain.getContract(factory.address)).balance,
            (await blockchain.getContract(vaultNative.address)).balance,
            (await blockchain.getContract(jetton.vault.address)).balance,
            (await blockchain.getContract(admin.address)).balance,
        );
        console.log('---- vault.sendCreatePoolNative ----');
        let res1 = await vaultNative.sendCreatePoolNative(
            admin.getSender(),
            toNano(5.0),
            toNano(4.0),
            admin.address,
            new PoolParams(AssetNative.INSTANCE, AssetJetton.fromAddress(jetton.master.address), AMM.ConstantProduct),
            null
        );

        printTransactions(res1.transactions);
        console.log('---- vault.sendCreatePoolJetton ----');
        await new Promise(r => setTimeout(r, 2000));
        let res2 = await jetton.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton.vault.address,
            toNano(10.0),
            admin.address,
            new PoolParams(AssetNative.INSTANCE, AssetJetton.fromAddress(jetton.master.address), AMM.ConstantProduct),
            null
        );
        printTransactions(res2.transactions);
        const poolAddress = getTransactionAccount(res2.transactions[8])!
        console.log('pool address = ', poolAddress.toRawString());
        console.log(
            'balances #3',
            (await blockchain.getContract(factory.address)).balance,
            (await blockchain.getContract(vaultNative.address)).balance,
            (await blockchain.getContract(jetton.vault.address)).balance,
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
        const res = await pool.sendProvideWalletAddress(admin.getSender(), toNano(1.0), admin.address);
        printTransactions(res.transactions);
    });
});
