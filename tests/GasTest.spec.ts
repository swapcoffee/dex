import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {printTransactions} from "../wrappers/utils";
import {compile} from "@ton/blueprint";
import {GasContract} from "../wrappers/unit/GasContract";

describe('Test', () => {
    let gasContractCode: Cell;

    beforeAll(async () => {
        gasContractCode = await compile("unit/GasContract");
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(1000.0)});
    });

    test('test measure storage gas', async () => {


        let gas = blockchain.openContract(
            GasContract.createFromConfig(gasContractCode, admin.address)
        )

        let txs = await gas.sendSmth(
            admin.getSender(),
            admin.address,
            toNano(2),
            1234, 100, 10_000_000
        )
        printTransactions(txs.transactions);
        console.log("gas:", txs.transactions[1].outMessages.get(0)?.body.beginParse().skip(96).loadCoins());

        txs = await gas.sendSmth(
            admin.getSender(),
            admin.address,
            toNano(2),
            1234, 100, 10_000_000
        )
        printTransactions(txs.transactions);
        console.log("gas:", txs.transactions[1].outMessages.get(0)?.body.beginParse().skip(96).loadCoins());
        let date = new Date();

        blockchain.now = (date.getTime() / 1_000 | 0) + 1_000;
        console.log("now:", blockchain.now);
        txs = await gas.sendSmth(
            admin.getSender(),
            admin.address,
            toNano(2),
            1234, 100, 10_000_000
        )
        printTransactions(txs.transactions);
        console.log("gas:", txs.transactions[1].outMessages.get(0)?.body.beginParse().skip(96).loadCoins());
        // let storageGas = txs.transactions
        // expect(txs.transactions).toHaveTransaction(
        //     {
        //         to: pool.address,
        //         success: true,
        //         exitCode: 0
        //     }
        // )
    });


});
