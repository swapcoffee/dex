import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { StableWrapper } from '../../../wrappers/unit/StableWrapper';
import fs from 'node:fs';
import { DEFAULT_TIMEOUT, prepareMultiSwapsCells, SwapData } from '../../helpers';

describe('Test', () => {
    let stableWrapperCode: Cell;
    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let stableWrapper: SandboxContract<StableWrapper>;

    beforeAll(async () => {
        stableWrapperCode = await compile('unit/StableWrapper');
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', { balance: toNano(10.0) });
        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));
    }, DEFAULT_TIMEOUT);

    it('swap, all invariants from Vyper code', async () => {
        let data = fs.readFileSync('tests/data/stable_swap_generated_data_for_test.txt', 'utf-8');
        let items = data.split('\n');
        let knownMap: { [id: string]: boolean } = {};
        let itemsToIterate = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i] in knownMap) {
                continue;
            }
            knownMap[items[i]] = true;
            itemsToIterate.push(items[i]);
        }
        console.log('items:', items.length, 'unique:', itemsToIterate.length);

        const amm_settings = beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell();
        const entries: SwapData[] = [];
        for (let i = 0; i < itemsToIterate.length; i++) {
            let params = parseString(itemsToIterate[i]);
            if (params.length != 6) {
                continue;
            }
            let reserve1 = params[0];
            let reserve2 = params[1];
            let isFirst = params[2];
            let input_amount = params[3];
            let expected_output_amount = params[4];
            let isOk = params[5];

            let direction: bigint;
            // перепутал полярность в sol тестах
            if (isFirst == 1n) {
                direction = 0n;
            } else {
                direction = 1n;
            }
            if (isOk == 0n) {
                expected_output_amount = -1n;
            }

            entries.push({
                input_amount,
                reserve1,
                reserve2,
                direction,
                expected_output_amount
            });
        }
        const cells = prepareMultiSwapsCells(entries)
        console.log('cells:', cells.length)
        let handled = 0
        for (const cellWithData of cells) {
            await stableWrapper.checkMultiSwaps(blockchain, cellWithData, amm_settings)
            console.log('handled', ++handled, 'out of', cells.length)
        }
    })

    function parseString(param: string): bigint[] {
        let items = param.split(' ');
        let res: bigint[] = [];
        for (let i = 2; i < items.length; i++) {
            try {
                res.push(BigInt(items[i].replace(' ', '')));
            } catch (e) {
                return [];
            }
        }
        return res;
    }
});