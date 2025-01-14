import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, Slice, toNano} from '@ton/core';
import '@ton/test-utils';
import {StableWrapper} from "../../../wrappers/unit/StableWrapper";
import {SwapWrapper} from "../../../wrappers/unit/SwapWrapper";
import {VolatileWrapper} from "../../../wrappers/unit/VolatileWrapper";
import {printTransactions} from "../../../wrappers/utils";
import {CodeCells, compileCodes, compileWrappers} from "../../utils";
import {Factory} from "../../../wrappers/Factory";

describe('Test', () => {
    let stableWrapperCode: Cell
    let volatileWrapperCode: Cell
    let swapWrapperCode: Cell
    let codeCells: CodeCells;

    beforeAll(async () => {
        codeCells = await compileCodes();
        const wrappers = await compileWrappers();
        swapWrapperCode = wrappers.swap;
        volatileWrapperCode = wrappers.volatile;
        stableWrapperCode = wrappers.stable;
    }, 15000);

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

    let factory: SandboxContract<Factory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});

        asset1 = await blockchain.treasury('asset1', {balance: toNano(10.0)});
        asset2 = await blockchain.treasury('asset2', {balance: toNano(10.0)});

        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        await factory.sendDeploy(admin.getSender(), toNano(1.0));

        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));

        volatileWrapper = blockchain.openContract(
            VolatileWrapper.createFromConfig(volatileWrapperCode)
        )
        await volatileWrapper.sendDeploy(admin.getSender(), toNano(1.0));

        // native -> extra
        await buildSwapper(0, volatileReserve1, volatileReserve2, volatileLp, 10_000, 20_000);
    });

    it('test, swap internal, first asset, deadline, no notification', async () => {
        let before = await swapWrapper.getPoolData();

        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(100) // in
            .storeUint(0, 1) // hint
            .storeCoins(0) // min out
            .storeMaybeRef(null) // next
            .storeRef( // params
                beginCell()
                    .storeUint(2000, 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(null) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    // .storeAddress(admin.address) no admin here >> for tests only
                    .storeUint(1, 2) // type
                    .storeSlice(buildNativeAsset())
                    .storeSlice(buildJettonAsset(admin.address)) // -> forward
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(null)),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(100)
                    .storeMaybeRef(null)
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(before.reserve1).toBe(after.reserve1);
        expect(before.reserve2).toBe(after.reserve2);
    });

    it('test, swap internal, second asset, deadline, no notification', async () => {
        let before = await swapWrapper.getPoolData();

        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(100)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(null)
            .storeRef( // params
                beginCell()
                    .storeUint(2000, 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(null) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildExtraAsset(1))
                    .storeSlice(buildJettonAsset(admin.address)) // -> backward
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(BigInt(1))),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(100)
                    .storeMaybeRef(null)
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(before.reserve1).toBe(after.reserve1);
        expect(before.reserve2).toBe(after.reserve2);
    });

    it('test, swap internal, second asset, deadline, has notification', async () => {
        let before = await swapWrapper.getPoolData();

        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(100)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(null)
            .storeRef( // params
                beginCell()
                    .storeUint(2000, 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                        .storeMaybeRef(null)
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildExtraAsset(1))
                    .storeSlice(buildJettonAsset(admin.address)) // -> backward
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(BigInt(1))),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(100)
                    .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(before.reserve1).toBe(after.reserve1);
        expect(before.reserve2).toBe(after.reserve2);
    });

    it('test, swap internal, first asset, swap failed, has notification', async () => {
        let before = await swapWrapper.getPoolData();

        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(100)
            .storeUint(0, 1)
            .storeCoins(1_0000)
            .storeMaybeRef(null)
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                        .storeMaybeRef(null)
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildNativeAsset())
                    .storeSlice(buildJettonAsset(admin.address)) // -> backward
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(null)),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(100)
                    .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(before.reserve1).toBe(after.reserve1);
        expect(before.reserve2).toBe(after.reserve2);
    });

    it('test, swap internal, second asset, swap failed, has notification', async () => {
        let before = await swapWrapper.getPoolData();

        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(100)
            .storeUint(0, 1)
            .storeCoins(1_0000)
            .storeMaybeRef(null)
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                        .storeMaybeRef(null)
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildExtraAsset(1))
                    .storeSlice(buildJettonAsset(admin.address)) // -> backward
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(1n)),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(100)
                    .storeMaybeRef(beginCell().storeUint(1, 1).endCell())
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(before.reserve1).toBe(after.reserve1);
        expect(before.reserve2).toBe(after.reserve2);
    });

    it('test, swap internal, pool input first asset, swap ok, has notification, to vault second', async () => {
        let before = await swapWrapper.getPoolData();
        console.log(before);

        let inAmount = 1000n;
        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(inAmount)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(null) // next
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(null)
                        .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildNativeAsset())
                    .storeSlice(buildJettonAsset(admin.address))
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        let woFee = (v: bigint, a: bigint, b: bigint) => v - v * (a + b) / 1_000_000n;
        let onlyFee = (v: bigint, a: bigint, b: bigint) => v * (a + b) / 1_000_000n;

        let inConductFee = woFee(inAmount, 10_000n, 20_000n);
        let infFee = onlyFee(inAmount, 10_000n, 20_000n);
        let inLpFee = infFee * 20_000n / (10_000n + 20_000n);
        let expectedOut = (await volatileWrapper.getSwap(inConductFee, volatileReserve1, volatileReserve2)).amountOut;

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(1n)),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(expectedOut)
                    .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(after.reserve1).toBe(before.reserve1 + inConductFee + inLpFee);
        expect(after.reserve2).toBe(before.reserve2 - expectedOut);
    });

    it('test, swap internal, pool input second asset, swap ok, has notification, to vault first', async () => {
        let before = await swapWrapper.getPoolData();
        console.log(before);

        let inAmount = 1000n;
        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(inAmount)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(null) // next
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(null)
                        .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildJettonAsset(admin.address))
                    .storeSlice(buildExtraAsset(1))
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        let woFee = (v: bigint, a: bigint, b: bigint) => v - v * (a + b) / 1_000_000n;
        let onlyFee = (v: bigint, a: bigint, b: bigint) => v * (a + b) / 1_000_000n;

        let inConductFee = woFee(inAmount, 10_000n, 20_000n);
        let infFee = onlyFee(inAmount, 10_000n, 20_000n);
        let inLpFee = infFee * 20_000n / (10_000n + 20_000n);
        let expectedOut = (await volatileWrapper.getSwap(inConductFee, volatileReserve2, volatileReserve1)).amountOut;

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: (await factory.getVaultAddress(null)),
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(expectedOut)
                    .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        console.log(before);
        console.log(after);
        console.log(expectedOut);
        expect(after.reserve1).toBe(before.reserve1 - expectedOut);
        expect(after.reserve2).toBe(before.reserve2 + inConductFee + inLpFee);
    });

    it('test, swap internal, pool input first asset, swap ok, has notification, to next pool', async () => {
        let before = await swapWrapper.getPoolData();
        let inAmount = 1000n;
        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(inAmount)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(
                beginCell()
                    .storeUint(12345, 256) // address
                    .storeCoins(1234)
                    .storeMaybeRef(beginCell().endCell())
                    .endCell()
            ) // next
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(null)
                        .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildNativeAsset())
                    .storeSlice(buildJettonAsset(admin.address))
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        let woFee = (v: bigint, a: bigint, b: bigint) => v - v * (a + b) / 1_000_000n;
        let onlyFee = (v: bigint, a: bigint, b: bigint) => v * (a + b) / 1_000_000n;

        let inConductFee = woFee(inAmount, 10_000n, 20_000n);
        let infFee = onlyFee(inAmount, 10_000n, 20_000n);
        let inLpFee = infFee * 20_000n / (10_000n + 20_000n);
        let expectedOut = (await volatileWrapper.getSwap(inConductFee, volatileReserve1, volatileReserve2)).amountOut;

        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwOW2z"),
                body: beginCell()
                    .storeUint(0xc0ffee20, 32)
                    .storeUint(0, 64)
                    .storeCoins(expectedOut)
                    .storeUint(1, 1)
                    .storeSlice(buildExtraAsset(1))
                    .storeCoins(1234)
                    .storeMaybeRef(beginCell().endCell())
                    .storeRef(
                        beginCell()
                            .storeUint(BigInt((1 << 30) * 2), 32)
                            .storeAddress(admin.address) // recipient
                            .storeAddress(null) // referral
                            .storeMaybeRef(beginCell()
                                .storeMaybeRef(null)
                                .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                                .endCell()) // notification
                            .endCell()
                    )
                    .storeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        expect(after.reserve1).toBe(before.reserve1 + inConductFee + inLpFee);
        expect(after.reserve2).toBe(before.reserve2 - expectedOut);
    });

    it('test, swap internal, pool input second asset, swap ok, has notification, to next first', async () => {
        let before = await swapWrapper.getPoolData();
        console.log(before);

        let inAmount = 1000n;
        let res = await swapWrapper.sendSwapInternal(admin.getSender(), toNano('1'), beginCell()
            .storeCoins(inAmount)
            .storeUint(0, 1)
            .storeCoins(0)
            .storeMaybeRef(beginCell()
                .storeUint(12345, 256)
                .storeCoins(1234)
                .storeMaybeRef(null)
                .endCell()
            ) // next
            .storeRef( // params
                beginCell()
                    .storeUint(BigInt((1 << 30) * 2), 32)
                    .storeAddress(admin.address) // recipient
                    .storeAddress(null) // referral
                    .storeMaybeRef(beginCell()
                        .storeMaybeRef(null)
                        .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                        .endCell()) // notification
                    .endCell()
            )
            .storeRef( // proof
                beginCell()
                    //.storeAddress(admin.address)
                    .storeUint(1, 2) // type
                    .storeSlice(buildJettonAsset(admin.address))
                    .storeSlice(buildExtraAsset(1))
                    .endCell()
            )

            .endCell());
        printTransactions(res.transactions);

        let woFee = (v: bigint, a: bigint, b: bigint) => v - v * (a + b) / 1_000_000n;
        let onlyFee = (v: bigint, a: bigint, b: bigint) => v * (a + b) / 1_000_000n;

        let inConductFee = woFee(inAmount, 10_000n, 20_000n);
        let infFee = onlyFee(inAmount, 10_000n, 20_000n);
        let inLpFee = infFee * 20_000n / (10_000n + 20_000n);
        let expectedOut = (await volatileWrapper.getSwap(inConductFee, volatileReserve2, volatileReserve1)).amountOut;


        expect(res.transactions).toHaveTransaction(
            {
                from: swapWrapper.address,
                to: Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwOW2z"),
                body: beginCell()
                    .storeUint(0xc0ffee20, 32)
                    .storeUint(0, 64)
                    .storeCoins(expectedOut)
                    .storeUint(1, 1)
                    .storeSlice(buildNativeAsset())
                    .storeCoins(1234)
                    .storeMaybeRef(null)
                    .storeRef(
                        beginCell()
                            .storeUint(BigInt((1 << 30) * 2), 32)
                            .storeAddress(admin.address) // recipient
                            .storeAddress(null) // referral
                            .storeMaybeRef(beginCell()
                                .storeMaybeRef(null)
                                .storeMaybeRef(beginCell().storeUint(10, 10).endCell())
                                .endCell()) // notification
                            .endCell()
                    )
                    .storeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(0, 2)
                        .storeSlice(buildNativeAsset())
                        .storeSlice(buildExtraAsset(1))
                        .storeUint(0, 3)
                        .endCell())
                    .endCell()
            }
        )

        let after = await swapWrapper.getPoolData();
        console.log(before);
        console.log(after);
        expect(after.reserve1).toBe(before.reserve1 - expectedOut);
        expect(after.reserve2).toBe(before.reserve2 + inConductFee + inLpFee);
    });


    function buildJettonAsset(address: Address): Slice {
        return beginCell()
            .storeUint(1, 2)
            .storeUint(address.workChain, 8)
            .storeBuffer(address.hash)
            .endCell().beginParse()
    }

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
        lpFee: number
    ) {
        swapWrapper = blockchain.openContract(
            SwapWrapper.createFromConfig(
                swapWrapperCode,

                factory.address,
                buildNativeAsset(),
                buildExtraAsset(1),

                amm,
                null,

                reserve1,
                reserve2,
                totalSupply,

                protocolFee, lpFee,
                codeCells.init
            )
        );

        await swapWrapper.sendDeploy(admin.getSender(), toNano(1));
    }

});