import { NetworkProvider } from '@ton/blueprint';
import { Address, beginCell, Cell, internal, SenderArguments, toNano } from '@ton/core';
import { buildFirstFactoryCodeCell, buildSecondFactoryCodeCell, Factory } from '../wrappers/Factory';
import { AMM, Asset, AssetExtra, AssetJetton, AssetNative, PoolParams } from '../wrappers/types';
import { CodeCells, compileCodes } from '../tests/utils';
import { proposeMultisigMessages } from '../wrappers/multisig';
import { waitSeqNoChange } from './utils';
import { VaultJetton } from '../wrappers/VaultJetton';
import { JettonMaster } from '../wrappers/Jetton';
import { WalletContractV4 } from '@ton/ton';

enum COMMANDS {
    ACTIVATE_VAULT,
    UPDATE_POOL,
    UPDATE_CONTRACT,
    UPDATE_CODE_CELLS,
    UPDATE_ADMIN,
    UPDATE_WITHDRAWER
}

export async function run(provider: NetworkProvider) {
    const sender = provider.sender()
    if (!sender.address) {
        throw new Error('sender address must be present')
    }
    const ui = provider.ui()
    const factoryAddress = await ui.inputAddress(
        'Enter factory address',
        Address.parse('EQAsf2sDPfoo-0IjnRA7l_gJBB9jyo4zqfCG_1IFCCI_Qbef')
    )
    const factory = provider.open(Factory.createFromAddress(factoryAddress))
    const factoryAdminAddress = await factory.getAdminAddress()
    if (factoryAdminAddress.toRawString() !== sender.address.toRawString()) {
        try {
            await provider.provider(factoryAdminAddress).get('get_multisig_data', [])
            console.log('Multisig is the admin of that factory! Your actions will be proposed..')
        } catch (ignored) {
            throw new Error('You are not the admin of that factory! Real one: ' + factoryAdminAddress.toRawString())
        }
    } else {
        console.log('You are the admin of that factory!')
    }
    const command = await ui.choose("Select command:",
        Object.values(COMMANDS).filter(it => typeof(it) === 'number').map(it => it as number),
        (x) => COMMANDS[x].toString()
    )

    let actions: SenderArguments[] = []
    while (true) {
        if (command == COMMANDS.ACTIVATE_VAULT) {
            const jettonMasterAddress = await ui.inputAddress('Enter jetton (master) address')
            const vaultAddress = await factory.getVaultAddress(jettonMasterAddress)
            console.log('Vault address:', vaultAddress)
            const vault = provider.open(VaultJetton.createFromAddress(vaultAddress))
            if (await vault.getIsActive()) {
                throw new Error('This vault is already active')
            }
            const jettonMaster = provider.open(JettonMaster.createFromAddress(jettonMasterAddress))
            const jettonWalletAddress = await jettonMaster.getWalletAddress(vaultAddress)
            console.log('Vault jetton wallet address:', jettonWalletAddress)
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildActivateVault(jettonMaster, jettonWalletAddress)
            })
            if (parseYesNo(await ui.input('Do you want to activate more vaults ("y" / "n")?'))) {
                continue
            } else {
                break
            }
        }
        if (command == COMMANDS.UPDATE_POOL) {
            const firstAsset = parseAsset(
                await ui.input('Enter 1st asset (empty for TON, address for jetton, number for extra)')
            )
            const secondAsset = parseAsset(
                await ui.input('Enter 2nd asset (empty for TON, address for jetton, number for extra)')
            )
            const isAmmConstantProduct = await ui.input(
                'Only constant_product AMM pools may be updated via chat. Press "y" if you agree'
            )
            if (isAmmConstantProduct !== 'y' && isAmmConstantProduct !== 'Y') {
                throw new Error('Non constant_product AMMs must be updated via code')
            }
            const protocolFee = parseFee(
                await ui.input('Enter protocol fee (1 = 0.0001%; 10000 = 1%; empty = same as previous)')
            )
            const lpFee = parseFee(
                await ui.input('Enter LP fee (1 = 0.0001%; 10000 = 1%; empty = same as previous)')
            )
            const isActive = parseIsActive(
                await ui.input('Enter whether pool is active ("y", "n" or empty to leave the same as previous)')
            )
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildUpdatePool(
                    new PoolParams(firstAsset, secondAsset, AMM.ConstantProduct),
                    protocolFee,
                    lpFee,
                    isActive
                )
            })
            if (parseYesNo(await ui.input('Do you want to update more pools ("y" / "n")?'))) {
                continue
            } else {
                break
            }
        }
        if (command == COMMANDS.UPDATE_CONTRACT) {
            const targetAddress = await ui.inputAddress('Enter target address')
            const compiled = await getCompiledCodes()
            if (targetAddress.toRawString() === factoryAddress.toRawString()) {
                actions.push({
                    to: factoryAddress,
                    value: toNano(.05),
                    body: factory.buildUpdateContract(null, compiled.factory, null)
                })
            } else {
                const state = await provider.provider(targetAddress).getState()
                if (state.state.type !== 'active') {
                    throw new Error('Wrong state for given address: ' + state.state.type)
                }
                const dataCell = Cell.fromBoc(state.state.data as Buffer)[0]
                const cs = dataCell.beginParse()
                cs.loadRef()
                const initDataS = cs.loadRef().beginParse()
                const currentFactoryAddress = initDataS.loadAddress()
                if (currentFactoryAddress.toRawString() !== factoryAddress.toRawString()) {
                    throw new Error('Target is of another factory: ' + currentFactoryAddress.toRawString())
                }
                const contractType = initDataS.loadUint(2)
                if (contractType == 0) {
                    const vaultType = initDataS.loadUint(2)
                    let codeCell
                    if (vaultType == 0) {
                        codeCell = compiled.vaultNative
                    } else if (vaultType == 1) {
                        codeCell = compiled.vaultJetton
                    } else if (vaultType == 2) {
                        codeCell = compiled.vaultExtra
                    } else {
                        throw new Error('Unknown vault type: ' + vaultType)
                    }
                    actions.push({
                        to: factoryAddress,
                        value: toNano(.05),
                        body: factory.buildUpdateContract(targetAddress, codeCell, null)
                    })
                } else if (contractType == 1) {
                    const amm = initDataS.loadUint(3)
                    let codeCell
                    if (amm == 0) {
                        codeCell = compiled.poolConstantProduct
                    } else if (amm == 1) {
                        codeCell = compiled.poolCurveFiStable
                    } else {
                        throw new Error('Unknown amm: ' + amm)
                    }
                    actions.push({
                        to: factoryAddress,
                        value: toNano(.05),
                        body: factory.buildUpdateContract(targetAddress, codeCell, null)
                    })
                } else {
                    throw new Error('Unsupported contract type: ' + contractType)
                }
            }
            if (parseYesNo(await ui.input('Do you want to update more contracts ("y" / "n")?'))) {
                continue
            } else {
                break
            }
        }
        if (command == COMMANDS.UPDATE_CODE_CELLS) {
            const compiled = await getCompiledCodes()
            const first = buildFirstFactoryCodeCell(compiled)
            const second = buildSecondFactoryCodeCell(compiled)
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildUpdateCodeCells(first, second)
            })
            break
        }
        if (command == COMMANDS.UPDATE_ADMIN) {
            const adminAddress = await ui.inputAddress('Enter new admin address')
            console.log('Factory address:', factory.address.toRawString())
            console.log('New admin address:', adminAddress.toRawString())
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildUpdateAdmin(adminAddress)
            })
            break
        }
        if (command == COMMANDS.UPDATE_WITHDRAWER) {
            const withdrawerAddress = await ui.inputAddress('Enter new withdrawer address')
            console.log('Factory address:', factory.address.toRawString())
            console.log('New withdrawer address:', withdrawerAddress.toRawString())
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildUpdateWithdrawer(withdrawerAddress)
            })
            break
        }
    }
    console.log('Actions to be processed:', actions.length)
    if (!parseYesNo(await ui.input('Are you ready to proceed ("y" / "n")?'))) {
        console.error('Cancelled')
        return
    }
    if (sender.address.toRawString() === factoryAdminAddress.toRawString()) {
        if (actions.length > 1) {
            throw new Error('We do not know how to sent >1 messages via blueprint, sorry ):')
        }
        await waitSeqNoChange(provider, sender.address, async () => {
            await sender.send({
                to: actions[0].to,
                body: actions[0].body,
                value: actions[0].value
            })
        })
    } else {
        await proposeMultisigMessages(provider, factoryAdminAddress, actions)
        console.log('Proposal has been made for the multisig!')
    }
}

let compiledCode: CodeCells | null = null
async function getCompiledCodes(): Promise<CodeCells> {
    if (compiledCode === null) {
        compiledCode = await compileCodes()
    }
    return compiledCode
}

function parseYesNo(input: string): boolean {
    return input === 'y' || input === 'Y'
}

function parseAsset(input: string): Asset {
    if (input === '') {
        return AssetNative.INSTANCE
    }
    try {
        return new AssetExtra(BigInt(Number.parseInt(input)))
    } catch (ignored) {
        try {
            return AssetJetton.fromAddress(Address.parse(input))
        } catch (e) {
            throw e
        }
    }
}

function parseFee(input: string): number | null {
    if (input === '') {
        return null
    }
    const num = Number.parseInt(input)
    if (num > 10000 || num < 0) {
        throw new Error('Fee must be within bounds [0; 10000]')
    }
    return num
}

function parseIsActive(input: string): boolean | null {
    if (input === '') {
        return null
    }
    if (input === 'y' || input === 'Y') {
        return true
    }
    if (input === 'n' || input === 'N') {
        return false
    }
    throw new Error('Unexpected input value')
}