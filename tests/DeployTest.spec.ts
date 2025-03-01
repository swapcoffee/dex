import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {printTransactions} from "../wrappers/utils";
import {AMM, PoolParams} from "../wrappers/types";
import {CodeCells, compileCodes} from "./utils";
import { deployJettonWithoutVault, deployJettonWithVault, deployNativeVault } from './helpers';

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
        const jetton = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST'
        )
        expect((await factory.getVaultAddress(jetton.master.address)).toRawString())
            .toBe(jetton.vault.address.toRawString())
    });

    it('deploy vault native', async () => {
        const nativeVault = await deployNativeVault(blockchain, factory, admin)
        expect((await factory.getVaultAddress(null)).toRawString()).toBe(nativeVault.address.toRawString())
    });

    it('deploy pool jetton+native stable', async () => {
        const jetton = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST'
        )
        const nativeVault = await deployNativeVault(blockchain, factory, admin)

        const ammSettings = beginCell()
            .storeUint(2_000, 16)
            .storeCoins(1)
            .storeCoins(1)
            .endCell()

        let txs = await jetton.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton.vault.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jetton.master.address, null, AMM.CurveFiStable),
            ammSettings,
            null
        );

        let address1 = await factory.getPoolAddress(jetton.master.address, null, AMM.CurveFiStable);
        let address2 = await factory.getPoolAddress(null, jetton.master.address, AMM.CurveFiStable);

        expect(address1.toRawString()).toBe(address2.toRawString());
        expect(txs.transactions).toHaveTransaction({
            to: jetton.vault.address,
            exitCode: 0,
            success: true
        });
        expect(txs.transactions).toHaveTransaction({
            from: jetton.vault.address,
            to: factory.address,
            exitCode: 0,
            success: true
        });

        txs = await nativeVault.sendCreatePoolNative(
            admin.getSender(),
            toNano(5.0),
            toNano(4.0),
            admin.address,
            PoolParams.fromAddress(null, jetton.master.address, AMM.CurveFiStable),
            ammSettings,
            null
        );

        expect(txs.transactions).toHaveTransaction({
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
            to: address1,
            exitCode: 0,
            success: true
        });
    });

    it('deploy pool jetton+jetton', async () => {
        const jetton1 = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST1'
        )
        const jetton2 = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST2'
        )

        let txs = await jetton1.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton1.vault.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jetton1.master.address, jetton2.master.address, AMM.ConstantProduct),
            null,
            null
        );

        let address1 = await factory.getPoolAddress(jetton1.master.address, jetton2.master.address, AMM.ConstantProduct);
        let address2 = await factory.getPoolAddress(jetton2.master.address, jetton1.master.address, AMM.ConstantProduct);

        expect(address1.toRawString()).toBe(address2.toRawString());
        expect(txs.transactions).toHaveTransaction({
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

        txs = await jetton2.wallet.sendCreatePoolJetton(
            admin.getSender(),
            toNano(1.0),
            jetton2.vault.address,
            toNano(10.0),
            admin.address,
            PoolParams.fromAddress(jetton1.master.address, jetton2.master.address, AMM.ConstantProduct),
            null,
            null
        );
        printTransactions(txs.transactions);

        expect(txs.transactions).toHaveTransaction({
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
            to: address1,
            exitCode: 0,
            success: true
        });
    });

    it('failed to resolve pool for the same jetton masters', async () => {
        const jetton = await deployJettonWithoutVault(
            blockchain,
            admin,
            'TST1'
        )
        let func = async () => factory.getPoolAddress(
            jetton.master.address,
            jetton.master.address,
            AMM.ConstantProduct
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 257");
    });
});