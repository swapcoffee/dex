import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {address, Address, beginCell, Cell, Slice, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from "@ton/blueprint";
import {StableWrapper} from "../../../wrappers/unit/StableWrapper";
import fs from 'node:fs';
import {SwapWrapper} from "../../../wrappers/unit/SwapWrapper";

describe('Test', () => {
    let stableWrapperCode: Cell
    let swapWrapperCode: Cell
    beforeAll(async () => {
        stableWrapperCode = await compile("unit/StableWrapper");
        swapWrapperCode = await compile("unit/SwapWrapper");
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let asset1: SandboxContract<TreasuryContract>;
    let asset2: SandboxContract<TreasuryContract>;
    let stableWrapper: SandboxContract<StableWrapper>;
    let swapWrapper: SandboxContract<SwapWrapper>

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(10.0)});

        asset1 = await blockchain.treasury('asset1', {balance: toNano(10.0)});
        asset2 = await blockchain.treasury('asset2', {balance: toNano(10.0)});

        stableWrapper = blockchain.openContract(
            StableWrapper.createFromConfig(stableWrapperCode)
        );
        await stableWrapper.sendDeploy(admin.getSender(), toNano(1.0));

        swapWrapper = blockchain.openContract(
            SwapWrapper.createFromConfig(
                swapWrapperCode,

                admin.address,
                buildNativeAsset(),
                buildExtraAsset(1),

                0,
                null,

                1n,
                1n,
                1n,

                100, 200
            )
        );

        await swapWrapper.sendDeploy(admin.getSender(), toNano(1));

    });

    it('test resolve direction from pool, first match: forward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildNativeAsset())
                .storeSlice(buildJettonAsset(admin.address))
                .endCell()
        );
        expect(res).toBe(0n);
    });

    it('test resolve direction from pool, first match: backward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildExtraAsset(1))
                .storeSlice(buildJettonAsset(admin.address))
                .endCell()
        );
        expect(res).toBe(1n);
    });

    it('test resolve direction from pool, second match: forwards', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildJettonAsset(admin.address))
                .storeSlice(buildExtraAsset(1))
                .endCell()
        );
        expect(res).toBe(1n);
    });

    it('test resolve direction from pool, second match: forwards', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildJettonAsset(admin.address))
                .storeSlice(buildNativeAsset())
                .endCell()
        );
        expect(res).toBe(0n);
    });

    it('test resolve direction from pool 1: failure', async () => {
        let func = async () => await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildExtraAsset(1))
                .storeSlice(buildNativeAsset())
                .endCell()
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 256");
    });

    it('test resolve direction from pool 2: failure', async () => {
        let func = async () => await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildNativeAsset())
                .storeSlice(buildExtraAsset(1))
                .endCell()
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 256");
    });

    it('test resolve direction from pool 1 with hint: failure (wrong assets order)', async () => {
        let func = async () => await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildExtraAsset(1))
                .storeSlice(buildNativeAsset())
                .endCell(),
            buildNativeAsset()
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 256");
    });

    it('test resolve direction from pool 2 with hint: forward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildNativeAsset())
                .storeSlice(buildExtraAsset(1))
                .endCell(),
            buildNativeAsset()
        );
        expect(res).toBe(0n);
    });

    it('test resolve direction from pool 2 with hint: backward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(1, 2) // type
                .storeSlice(buildNativeAsset())
                .storeSlice(buildExtraAsset(1))
                .endCell(),
            buildExtraAsset(1)
        );
        expect(res).toBe(1n);
    });

    it('test resolve direction from vault: forward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(0, 2) // type
                .storeSlice(buildNativeAsset())
                .endCell()
        );
        expect(res).toBe(0n);
    });

    it('test resolve direction from vault: backward', async () => {
        let res = await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(0, 2) // type
                .storeSlice(buildExtraAsset(1))
                .endCell()
        );
        expect(res).toBe(1n);
    });

    it('test resolve direction from vault: failure', async () => {
        let func = async () => await swapWrapper.getDirectionFromProof(
            beginCell()
                .storeAddress(admin.address)
                .storeUint(0, 2) // type
                .storeSlice(buildJettonAsset(admin.address))
                .endCell()
        );
        await expect(func()).rejects.toThrow("Unable to execute get method. Got exit_code: 256");
    });

    it('test resolve direction from unknown type: failure', async () => {
        let func = async () => {
            await swapWrapper.getDirectionFromProof(
                beginCell()
                    .storeAddress(admin.address)
                    .storeUint(2, 2) // type
                    .storeSlice(buildNativeAsset())
                    .storeSlice(buildJettonAsset(admin.address))
                    .endCell())
        };
        await expect(func()).rejects.toThrowError("Unable to execute get method. Got exit_code: 252");
    });


    function buildNativeAsset(): Slice {
        return beginCell()
            .storeUint(0, 2)
            .endCell().beginParse()
    }

    function buildJettonAsset(address: Address): Slice {
        return beginCell()
            .storeUint(1, 2)
            .storeUint(address.workChain, 8)
            .storeBuffer(address.hash)
            .endCell().beginParse()
    }

    function buildExtraAsset(n: number): Slice {
        return beginCell()
            .storeUint(2, 2)
            .storeUint(n, 32)
            .endCell().beginParse()
    }

});