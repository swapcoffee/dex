import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { JettonMaster, JettonWallet } from '../wrappers/Jetton';
import { VaultJetton } from '../wrappers/VaultJetton';
import { beginCell, Cell, toNano } from '@ton/core';
import { getTransactionAccount, printTransactions } from '../wrappers/utils';
import { Factory } from '../wrappers/Factory';
import { VaultNative } from '../wrappers/VaultNative';
import { VaultExtra } from '../wrappers/VaultExtra';

export const DEFAULT_TIMEOUT = 15000

export type JettonData = {
    master: SandboxContract<JettonMaster>,
    wallet: SandboxContract<JettonWallet>
}

export type JettonDataWithVault = {
    master: SandboxContract<JettonMaster>,
    wallet: SandboxContract<JettonWallet>,
    vault: SandboxContract<VaultJetton>
}

export type SwapData = {
    input_amount: bigint,
    reserve1: bigint,
    reserve2: bigint,
    direction: bigint,
    expected_output_amount: bigint
}

export type LiquidityAdditionData = {
    total_supply: bigint,
    reserve1: bigint,
    reserve2: bigint,
    amount1: bigint,
    amount2: bigint,
    expected_lp_amount: bigint
}

export type CellWithSwapData = {
    cell: Cell,
    swap_data: SwapData[]
}

export type CellWithLiquidityAdditionData = {
    cell: Cell,
    liquidity_addition_data: LiquidityAdditionData[]
}

export async function deployJettonWithoutVault(
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    name: string,
    isNoResolver: boolean = false
): Promise<JettonData> {
    const config = {owner: deployer.address, name}
    let jettonMaster
    if (isNoResolver) {
        jettonMaster = blockchain.openContract(JettonMaster.createFromConfigNoResolver(config))
    } else {
        jettonMaster = blockchain.openContract(JettonMaster.createFromConfig(config))
    }
    await jettonMaster.sendDeploy(deployer.getSender(), toNano(.1))
    let res = await jettonMaster.sendMint(
        deployer.getSender(),
        toNano(.05),
        deployer.address,
        toNano(100.0)
    )
    const jettonWallet = blockchain.openContract(
        JettonWallet.createFromAddress(getTransactionAccount(res.transactions[2])!)
    )
    console.log(
        'Jetton',
        name,
        'deployed:',
        'master=' + jettonMaster.address.toRawString() + ',',
        'owner=' + deployer.address.toRawString() + ',',
        'wallet=' + jettonWallet.address.toRawString()
    )
    return { master: jettonMaster, wallet: jettonWallet}
}

export async function deployJettonWithVault(
    blockchain: Blockchain,
    factory: SandboxContract<Factory>,
    deployer: SandboxContract<TreasuryContract>,
    name: string,
    isNoResolver: boolean = false
): Promise<JettonDataWithVault> {
    const data = await deployJettonWithoutVault(blockchain, deployer, name, isNoResolver)
    const jettonVault = await deployJettonVault(blockchain, factory, deployer, data.master)
    console.log(
        'Jetton',
        name,
        'vault deployed:',
        jettonVault.address.toRawString()
    )
    return { master: data.master, wallet: data.wallet, vault: jettonVault }
}

export async function deployJettonVault(
    blockchain: Blockchain,
    factory: SandboxContract<Factory>,
    deployer: SandboxContract<TreasuryContract>,
    jettonMaster: SandboxContract<JettonMaster>
): Promise<SandboxContract<VaultJetton>> {
    console.log('---- factory.sendCreateVaultJetton ----')
    const res = await factory.sendCreateVault(
        deployer.getSender(),
        toNano(.04),
        jettonMaster.address
    )
    printTransactions(res.transactions)
    const jettonVault = blockchain.openContract(
        VaultJetton.createFromAddress(getTransactionAccount(res.transactions[2])!)
    )
    expect(res.transactions).toHaveTransaction({
        from: deployer.address,
        to: factory.address,
        success: true,
        exitCode: 0
    })
    expect(res.transactions).toHaveTransaction({
        from: factory.address,
        to: jettonVault.address,
        success: true,
        exitCode: 0
    })
    expect(res.transactions).toHaveTransaction({
        from: jettonVault.address,
        to: jettonMaster.address,
        success: true,
        exitCode: 0,
        op: 0x2c76b973
    })
    expect(res.transactions).toHaveTransaction({
        from: jettonMaster.address,
        to: jettonVault.address,
        success: true,
        exitCode: 0,
        op: 0xd1735400
    })
    // 4 + 1
    expect(res.transactions.length).toBe(5)
    return jettonVault
}

export async function deployNativeVault(
    blockchain: Blockchain,
    factory: SandboxContract<Factory>,
    deployer: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<VaultNative>> {
    console.log('---- factory.sendCreateVaultNative ----')
    const res = await factory.sendCreateVault(deployer.getSender(), toNano(.04), null)
    printTransactions(res.transactions)
    const nativeVault = blockchain.openContract(
        VaultNative.createFromAddress(getTransactionAccount(res.transactions[2])!)
    )
    expect(res.transactions).toHaveTransaction({
        from: deployer.address,
        to: factory.address,
        success: true,
        exitCode: 0
    })
    expect(res.transactions).toHaveTransaction({
        from: factory.address,
        to: nativeVault.address,
        success: true,
        exitCode: 0
    })
    // 2 + 1
    expect(res.transactions.length).toBe(3)
    return nativeVault
}

export async function deployExtraVault(
    blockchain: Blockchain,
    factory: SandboxContract<Factory>,
    deployer: SandboxContract<TreasuryContract>,
    extraID: bigint
): Promise<SandboxContract<VaultExtra>> {
    console.log('---- factory.sendCreateVaultExtra ----')
    const res = await factory.sendCreateVault(deployer.getSender(), toNano(.04), extraID)
    printTransactions(res.transactions)
    const extraVault = blockchain.openContract(
        VaultExtra.createFromAddress(getTransactionAccount(res.transactions[2])!)
    )
    expect(res.transactions).toHaveTransaction({
        from: deployer.address,
        to: factory.address,
        success: true,
        exitCode: 0
    })
    expect(res.transactions).toHaveTransaction({
        from: factory.address,
        to: extraVault.address,
        success: true,
        exitCode: 0
    })
    // 2 + 1
    expect(res.transactions.length).toBe(3)
    return extraVault
}

export function prepareMultiSwapsCells(entries: SwapData[]): CellWithSwapData[] {
    return prepareMultiCells(
        entries,
        (entry, next) => {
            let builder = beginCell()
                .storeCoins(entry.input_amount)
                .storeCoins(entry.reserve1)
                .storeCoins(entry.reserve2)
                .storeUint(entry.direction, 1)
            if (entry.expected_output_amount === -1n) {
                builder.storeInt(0n, 1)
            } else {
                builder.storeInt(-1n, 1)
                    .storeCoins(entry.expected_output_amount)
            }
            return builder.storeMaybeRef(next).endCell()
        },
        (cell, data) => {
            return {cell, swap_data: data}
        }
    )
}

export function prepareMultiLiquidityAdditionCells(entries: LiquidityAdditionData[]): CellWithLiquidityAdditionData[] {
    return prepareMultiCells(
        entries,
        (entry, next) => {
            let builder = beginCell()
                .storeCoins(entry.total_supply)
                .storeCoins(entry.reserve1)
                .storeCoins(entry.reserve2)
                .storeCoins(entry.amount1)
                .storeCoins(entry.amount2)
            if (entry.expected_lp_amount === -1n) {
                builder.storeInt(0n, 1)
            } else {
                builder.storeInt(-1n, 1)
                    .storeCoins(entry.expected_lp_amount)
            }
            return builder.storeMaybeRef(next).endCell()
        },
        (cell, data) => {
            return {cell, liquidity_addition_data: data}
        }
    )
}

function prepareMultiCells<E, R>(
    entries: E[],
    cellBuilder: (entry: E, next: Cell | null) => Cell,
    resultBuilder: (cell: Cell, data: E[]) => R
) {
    const result: R[] = []
    let currentCell: Cell | null = null
    let currentDepth = 0
    let currentData: E[] = []
    for (let i = entries.length - 1; i >= 0; --i) {
        const entry = entries[i]
        currentCell = cellBuilder(entry, currentCell)
        currentData.unshift(entry)
        if (++currentDepth === 256) {
            result.push(resultBuilder(currentCell, currentData))
            currentCell = null
            currentDepth = 0
            currentData = []
        }
    }
    if (currentDepth !== 0) {
        result.push(resultBuilder(currentCell!, currentData))
    }
    return result
}