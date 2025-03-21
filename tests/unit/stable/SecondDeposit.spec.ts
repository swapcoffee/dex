import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from "@ton/blueprint";
import {StableWrapper} from "../../../wrappers/unit/StableWrapper";
import fs from 'node:fs';

describe('Test', () => {
    let stableWrapperCode: Cell
    beforeAll(async () => {
        stableWrapperCode = await compile("unit/StableWrapper");
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let stableWrapper: SandboxContract<StableWrapper>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});
        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));
    });

    it('tests second deposit, all invariants from Vyper code', async () => {
        let data = fs.readFileSync('tests/data/stable_second_deposit_generated_data_for_test.txt', 'utf-8');
        let items = data.split("\n");
        let knownMap: {[id: string]: boolean} = {};
        let itemsToIterate = [];
        for (let i = 0; i < items.length; i++) {
            if(items[i] in knownMap) {
                continue;
            }
            knownMap[items[i]] = true;
            itemsToIterate.push(items[i]);
        }
        console.log("items:", items.length, "unique:", itemsToIterate.length);

        for (let i = 0; i < itemsToIterate.length; i++) {

            let params = parseString(itemsToIterate[i]);
            if (params.length != 6) {
                continue;
            }

            let reserve1 = params[0];
            let reserve2 = params[1];

            let initLp = await stableWrapper.getAddLiquidity(0n,
                reserve1, reserve2, 0n, 0n,
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell());

            let add1 = params[2];
            let add2 = params[3];

            let finalLp = params[4];
            let ok = params[5];

            let res = await stableWrapper.getAddLiquidity(initLp.lp,
                add1, add2, reserve1, reserve2,
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell());
            if (ok == 1n) {
                expect(res.lp).toBe(finalLp);
            } else {
                expect(res.lp).toBe(0n);
            }

            if (i % 10_000 == 0) {
                console.log(i + "/" + itemsToIterate.length)
            }
        }
    });

    function parseString(param: string): bigint[] {
        let items = param.split(" ");
        let res: bigint[] = [];
        for (let i = 2; i < items.length; i++) {
            try {
                res.push(BigInt(items[i].replace(" ", "")));
            } catch (e) {
                return []
            }
        }
        return res;
    }
});