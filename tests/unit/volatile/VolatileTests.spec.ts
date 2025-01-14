import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from "@ton/blueprint";
import {VolatileWrapper} from "../../../wrappers/unit/VolatileWrapper";

var sqrt = require('bigint-isqrt');

describe('Test', () => {
    let volatileWrapperCode: Cell
    beforeAll(async () => {
        volatileWrapperCode = await compile("unit/VolatileWrapper");
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let volatileWrapper: SandboxContract<VolatileWrapper>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});
        volatileWrapper = blockchain.openContract(
            VolatileWrapper.createFromConfig(volatileWrapperCode)
        );
        await volatileWrapper.sendDeploy(admin.getSender(), toNano(1.0));
    });

    it('test first deposit low, returns zero', async () => {
        let func = async () => volatileWrapper.getAddLiquidity(0n, 1_00n, 1_00n, 0n, 0n);
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 264");
    });

    it('test first deposit', async () => {
        let a = 1_000n;
        for (let i = 0n; i < 30n; i++) {
            let b = 100_000_000n;
            for (let j = 0n; j < 30n; j++) {
                b += j;
                let res = await volatileWrapper.getAddLiquidity(0n, a, b, 0n, 0n);
                expect(res.lp).toBe(sqrt(a * b) - 1_000n);
                expect(res.amount1Initial).toBe(a);
                expect(res.amount2Initial).toBe(b);
                expect(res.lpToProtocol).toBe(1_000n);
            }
            a += i;
        }

        a = 1_000n;
        for (let i = 0n; i < 30n; i++) {
            let b = 100_000_000n;
            for (let j = 0n; j < 30n; j++) {
                b += j;
                let res = await volatileWrapper.getAddLiquidity(0n, b, a, 0n, 0n);
                expect(res.lp).toBe(sqrt(a * b) - 1_000n);
                expect(res.amount1Initial).toBe(b);
                expect(res.amount2Initial).toBe(a);
                expect(res.lpToProtocol).toBe(1_000n);
            }
            a += i;
        }
    });

    it('test second deposit, same value', async () => {
        let a = 1_000n;
        for (let i = 0n; i < 30n; i++) {
            let b = 100_000_000n;
            for (let j = 0n; j < 30n; j++) {
                b += j;

                // console.log("==========");
                // console.log(a, b);

                let a1 = a;
                let b1 = b;
                let lp0 = sqrt(a1 * b1) - 1_000n;

                let lp1 = a * lp0 / a1;
                let lp2 = b * lp0 / b1;

                let b2 = b1;
                let a2 = a1;
                let lpF = lp1;
                if (lp1 < lp2) {
                    b2 = lp1 * b1 / lp0;
                    lpF = lp1;
                } else if (lp1 > lp2) {
                    a2 = lp2 * a1 / lp0;
                    lpF = lp2;
                }

                let res = await volatileWrapper.getAddLiquidity(lp0, a, b, a1, b1);

                expect(res.lp).toBe(lpF);
                expect(res.amount1Initial).toBe(a2);
                expect(res.amount2Initial).toBe(b2);

                expect(res.lpToProtocol).toBe(0n);
            }
            a += i;
        }

        a = 1_000n;
        for (let i = 0n; i < 30n; i++) {
            let b = 100_000_000n;
            for (let j = 0n; j < 30n; j++) {
                b += j;

                let a1 = a;
                let b1 = b;
                let lp0 = sqrt(a1 * b1) - 1_000n;

                let lp1 = a * lp0 / a1;
                let lp2 = b * lp0 / b1;

                let b2 = b1;
                let a2 = a1;
                let lpF = lp1;
                if (lp1 < lp2) {
                    b2 = lp1 * b1 / lp0;
                    lpF = lp1;
                } else if (lp1 > lp2) {
                    a2 = lp2 * a1 / lp0;
                    lpF = lp2;
                }

                let res = await volatileWrapper.getAddLiquidity(lp1, b, a, b1, a1);
                expect(res.lp).toBe(lpF);
                expect(res.amount1Initial).toBe(b2);
                expect(res.amount2Initial).toBe(a2);
                expect(res.lpToProtocol).toBe(0n);
            }
            a += i;
        }
    });

    it('test second deposit, balanced, add disbalanced', async () => {
        let init = BigInt(1e9);
        let lpInit = sqrt(init * init) - 1_000n;

        let items: bigint[] = [];
        let start = 1_000n;
        for (let i = 1; i < 30; i++) {
            items.push(start + BigInt(i));
            if (i % 10 === 0) {
                start *= 10n;
            }
        }

        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < items.length; j++) {
                let a1 = items[i];
                let b1 = items[j];

                let lp1 = a1 * lpInit / init;
                let lp2 = b1 * lpInit / init;

                let a2 = a1;
                let b2 = b1;
                let lpF = lp1;
                if (lp1 < lp2) {
                    b2 = lp1 * init / lpInit;
                    lpF = lp1;
                } else if (lp1 > lp2) {
                    a2 = lp2 * init / lpInit;
                    lpF = lp2;
                }

                let res = await volatileWrapper.getAddLiquidity(lpInit, a1, b1, init, init);

                expect(res.lp).toBe(lpF);
                expect(res.amount1Initial).toBe(a2);
                expect(res.amount2Initial).toBe(b2);
                expect(res.lpToProtocol).toBe(0n);
            }
        }

        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < items.length; j++) {
                let a1 = items[i];
                let b1 = items[j];

                let lp1 = a1 * lpInit / init;
                let lp2 = b1 * lpInit / init;

                let a2 = a1;
                let b2 = b1;
                let lpF = lp1;
                if (lp1 < lp2) {
                    b2 = lp1 * init / lpInit;
                    lpF = lp1;
                } else if (lp1 > lp2) {
                    a2 = lp2 * init / lpInit;
                    lpF = lp2;
                }

                let res = await volatileWrapper.getAddLiquidity(lpInit, b1, a1, init, init);

                expect(res.lp).toBe(lpF);
                expect(res.amount1Initial).toBe(b2);
                expect(res.amount2Initial).toBe(a2);
                expect(res.lpToProtocol).toBe(0n);
            }
        }
    });

    it('test swap', async () => {
        let items: bigint[] = [];
        let start = 1_000n;
        for (let i = 1; i < 30; i++) {
            items.push(start + BigInt(i));
            if (i % 10 === 0) {
                start *= 10n;
            }
        }

        for (let i = 0; i < items.length; i++) {
            let input = items[i];
            let res = await volatileWrapper.getSwap(input, items[i], items[i]);
            expect(res.amountOut).toBe(input * items[i] / (input + items[i]));
            for (let j = 0; j < items.length; j++) {
                res = await volatileWrapper.getSwap(input, items[i], items[j]);
                expect(res.amountOut).toBe(input * items[j] / (input + items[i]));

                res = await volatileWrapper.getSwap(input, items[j], items[i]);
                expect(res.amountOut).toBe(input * items[i] / (input + items[j]));
            }

        }
    });


});