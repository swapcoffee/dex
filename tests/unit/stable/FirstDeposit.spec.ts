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

    it('tests first deposit, all invariants from Vyper code', async () => {
        let data = fs.readFileSync('tests/data/first_deposit_lp2.txt', 'utf-8');
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
            if (params.length != 4) {
                continue;
            }
            let res = await stableWrapper.getAddLiquidity(0n, params[0], params[1], 0n, 0n,
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell());
            if (params[3] == 1n) {
                expect(res.lp).toBe(params[2]);
            } else {
                expect(res.lp).toBe(BigInt(0));
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