import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from "@ton/blueprint";
import {StableWrapper} from "../../../wrappers/unit/StableWrapper";
import fs from 'node:fs';
import { DEFAULT_TIMEOUT, LiquidityAdditionData, prepareMultiLiquidityAdditionCells } from '../../helpers';

describe('Test', () => {
    let stableWrapperCode: Cell
    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let stableWrapper: SandboxContract<StableWrapper>;

    beforeEach(async () => {
        stableWrapperCode = await compile("unit/StableWrapper");
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});
        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));
    }, DEFAULT_TIMEOUT);

    it('second deposit, all invariants from Vyper code', async () => {
        let data = fs.readFileSync('tests/data/stable_second_deposit_generated_data_for_test.txt', 'utf-8');
        let items = data.split("\n");
        let knownMap: {[id: string]: boolean} = {};
        let itemsToIterate = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i] in knownMap) {
                continue;
            }
            knownMap[items[i]] = true;
            itemsToIterate.push(items[i]);
        }
        console.log("items:", items.length, "unique:", itemsToIterate.length);

        const amm_settings = beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell();
        const entries: LiquidityAdditionData[] = [];
        for (let i = 0; i < itemsToIterate.length; i++) {
            let params = parseString(itemsToIterate[i]);
            if (params.length != 6) {
                continue;
            }
            let reserve1 = params[0];
            let reserve2 = params[1];
            let amount1 = params[2];
            let amount2 = params[3];
            let finalLp = params[4];

            let expected_lp_amount: bigint;
            if (params[5] === 1n) {
                expected_lp_amount = finalLp;
            } else {
                expected_lp_amount = -1n;
            }
            entries.push({
                total_supply: 0n,
                reserve1,
                reserve2,
                amount1,
                amount2,
                expected_lp_amount
            })
        }
        const cells = prepareMultiLiquidityAdditionCells(entries)
        console.log('cells:', cells.length)
        let handled = 0
        for (const cellWithData of cells) {
            await stableWrapper.checkMultiLiquidityAdditions(blockchain, cellWithData, amm_settings, true)
            console.log('handled', ++handled, 'out of', cells.length)
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