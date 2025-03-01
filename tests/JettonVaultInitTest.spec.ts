import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {printTransactions} from "../wrappers/utils";
import {VaultJetton} from "../wrappers/VaultJetton";
import {CodeCells, compileCodes} from "./utils";
import { deployJettonWithoutVault } from './helpers';

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

    it('deploy vault for token without wallet resolver', async () => {
        const jetton = await deployJettonWithoutVault(
            blockchain,
            admin,
            'TST',
            true
        )
        let res = await factory.sendCreateVault(admin.getSender(), toNano(.04), jetton.master.address);
        const vaultJetton = blockchain.openContract(
            VaultJetton.createFromAddress(await factory.getVaultAddress(jetton.master.address))
        );
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
            to: jetton.master.address,
            success: false,
            exitCode: 65535,
            op: 0x2c76b973
        });
        expect(await vaultJetton.getIsActive()).toBe(0n);
        res = await factory.sendActivateVault(admin.getSender(), toNano(1.0), jetton.master.address, vaultJetton.address);
        printTransactions(res.transactions);
        expect(res.transactions).toHaveTransaction({
            from: factory.address,
            to: vaultJetton.address,
            success: true,
            exitCode: 0
        });
        expect(await vaultJetton.getIsActive()).toBe(-1n);
    });
});
