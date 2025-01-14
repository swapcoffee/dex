import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {beginCell, Cell, Slice, toNano} from '@ton/core';
import '@ton/test-utils';
import {StableWrapper} from "../../../wrappers/unit/StableWrapper";
import {SwapWrapper} from "../../../wrappers/unit/SwapWrapper";
import {VolatileWrapper} from "../../../wrappers/unit/VolatileWrapper";
import {compileWrappers} from "../../utils";

describe('Test', () => {
    let stableWrapperCode: Cell
    let volatileWrapperCode: Cell
    let swapWrapperCode: Cell
    beforeAll(async () => {
        const wrappers = await compileWrappers();
        swapWrapperCode = wrappers.swap;
        volatileWrapperCode = wrappers.volatile;
        stableWrapperCode = wrappers.stable;
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let asset1: SandboxContract<TreasuryContract>;
    let asset2: SandboxContract<TreasuryContract>;
    let stableWrapper: SandboxContract<StableWrapper>;
    let volatileWrapper: SandboxContract<VolatileWrapper>;
    let swapWrapper: SandboxContract<SwapWrapper>;

    let volatileReserve1 = 4_000n;
    let volatileReserve2 = 16_000n;
    let volatileLp = 8_000n;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});

        asset1 = await blockchain.treasury('asset1', {balance: toNano(10.0)});
        asset2 = await blockchain.treasury('asset2', {balance: toNano(10.0)});

        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));

        volatileWrapper = blockchain.openContract(
            VolatileWrapper.createFromConfig(volatileWrapperCode)
        )
        await volatileWrapper.sendDeploy(admin.getSender(), toNano(1.0));

        await buildSwapper(0, 1n, 1n, 1n, 10_000, 20_000);
    });

    it('test swap unknown amm', async () => {
        await buildSwapper(2, 1n, 1n, 1n, 10_000, 20_000);
        let func = async () => await swapWrapper.getPerformSwap(0, 100n, 0n);
        await expect(func).rejects.toThrow("Unable to execute get method. Got exit_code: 261");
    });

    it('test swap fail slippage, forward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 20_000);
        let func = async () => swapWrapper.getPerformSwap(1, 100n, 100000n);
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 269");
    });

    it('test swap fail slippage, backward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 20_000);
        let func = async () => swapWrapper.getPerformSwap(0, 100n, 100000n);
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 269");
    });

    it('test swap volatile amm, all fee, forward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 20_000);
        let res = await swapWrapper.getPerformSwap(0, 100n, 0n);
        expect(res.inputAmount).toBe(97n);
        expect(res.outAmount).toBe(378n);
        expect(res.reserveIn).toBe(volatileReserve1);
        expect(res.reserveOut).toBe(volatileReserve2);
        expect(res.lpFee).toBe(2n);
    });

    it('test swap volatile amm, all fee, backward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 20_000);
        let res = await swapWrapper.getPerformSwap(1, 100n, 0n);
        expect(res.inputAmount).toBe(97n);
        expect(res.outAmount).toBe(24n);
        expect(res.reserveIn).toBe(volatileReserve2);
        expect(res.reserveOut).toBe(volatileReserve1);
        expect(res.lpFee).toBe(2n);
    });

    it('test swap volatile amm, no fee, forward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 0, 0);
        let res = await swapWrapper.getPerformSwap(0, 100n, 0n);
        expect(res.inputAmount).toBe(100n);
        expect(res.outAmount).toBe(390n);
        expect(res.reserveIn).toBe(volatileReserve1);
        expect(res.reserveOut).toBe(volatileReserve2);
        expect(res.lpFee).toBe(0n);
    });

    it('test swap volatile amm, protocol fee, backward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 0, 0);
        let res = await swapWrapper.getPerformSwap(1, 100n, 0n);
        expect(res.inputAmount).toBe(100n);
        expect(res.outAmount).toBe(24n);
        expect(res.reserveIn).toBe(volatileReserve2);
        expect(res.reserveOut).toBe(volatileReserve1);
        expect(res.lpFee).toBe(0n);
    });

    it('test swap volatile amm, protocol fee, forward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 0);
        let res = await swapWrapper.getPerformSwap(0, 100n, 0n);
        expect(res.inputAmount).toBe(99n);
        expect(res.outAmount).toBe(386n);
        expect(res.reserveIn).toBe(volatileReserve1);
        expect(res.reserveOut).toBe(volatileReserve2);
        expect(res.lpFee).toBe(0n);
    });

    it('test swap volatile amm, protocol fee, backward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 0);
        let res = await swapWrapper.getPerformSwap(1, 100n, 0n);
        expect(res.inputAmount).toBe(99n);
        expect(res.outAmount).toBe(24n);
        expect(res.reserveIn).toBe(volatileReserve2);
        expect(res.reserveOut).toBe(volatileReserve1);
        expect(res.lpFee).toBe(0n);
    });

    it('test swap volatile amm, lp fee, forward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 0, 20_000);
        let res = await swapWrapper.getPerformSwap(0, 100n, 0n);
        expect(res.inputAmount).toBe(98n);
        expect(res.outAmount).toBe(382n);
        expect(res.reserveIn).toBe(volatileReserve1);
        expect(res.reserveOut).toBe(volatileReserve2);
        expect(res.lpFee).toBe(2n);
    });

    it('test swap volatile amm, lp fee, backward', async () => {
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 0, 20_000);
        let res = await swapWrapper.getPerformSwap(1, 100n, 0n);
        expect(res.inputAmount).toBe(98n);
        expect(res.outAmount).toBe(24n);
        expect(res.reserveIn).toBe(volatileReserve2);
        expect(res.reserveOut).toBe(volatileReserve1);
        expect(res.lpFee).toBe(2n);
    });

    function buildNativeAsset(): Slice {
        return beginCell()
            .storeUint(0, 2)
            .endCell().beginParse()
    }

    function buildExtraAsset(n: number): Slice {
        return beginCell()
            .storeUint(2, 2)
            .storeUint(n, 32)
            .endCell().beginParse()
    }

    async function buildSwapper(
        amm: number,
        reserve1: bigint,
        reserve2: bigint,
        totalSupply: bigint,
        protocolFee: number,
        lpFee: number,
    ) {
        swapWrapper = blockchain.openContract(
            SwapWrapper.createFromConfig(
                swapWrapperCode,

                admin.address,
                buildNativeAsset(),
                buildExtraAsset(1),

                amm,
                null,

                reserve1,
                reserve2,
                totalSupply,
                protocolFee,
                lpFee
            )
        );

        await swapWrapper.sendDeploy(admin.getSender(), toNano(1));
    }


});