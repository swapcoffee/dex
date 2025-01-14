import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from '@ton/blueprint';
import {printTransactions} from "../wrappers/utils";
import {TestContract2} from "../wrappers/unit/TestContract2";

describe('Test', () => {
    let testCode: Cell
    beforeAll(async () => {
        testCode = await compile('unit/TestContract2')
    });
    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let testContract: SandboxContract<TestContract2>;
    beforeAll(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(100.0)});
        testContract = blockchain.openContract(
            TestContract2.createFromConfig(1, testCode)
        )
    });
    it('estimate', async () => {
        blockchain.verbosity = {
            print: true,
            blockchainLogs: true,
            vmLogs: 'vm_logs_gas',
            debugLogs: true
        };
        let txs = await testContract.sendSmth(
            admin.getSender(),
            {
                value: toNano(1.0),
                opcode: 0x10,
                queryId: 20
            }
        )
        printTransactions(txs.transactions)
    });
});
