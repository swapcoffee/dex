import { NetworkProvider } from '@ton/blueprint';
import { Address, beginCell, Cell, OpenedContract, SenderArguments, toNano } from '@ton/core';
import { buildFirstFactoryCodeCell, buildSecondFactoryCodeCell, Factory } from '../wrappers/Factory';
import {
    AMM,
    Asset,
    AssetExtra,
    AssetJetton,
    AssetNative,
    PoolCreationParams,
    PoolParams, PrivatePoolCreationParams,
    PublicPoolCreationParams
} from '../wrappers/types';
import { CodeCells, compileCodes } from '../tests/utils';
import { proposeMultisigMessages } from '../wrappers/multisig';
import { waitSeqNoChange } from './utils';
import { VaultJetton } from '../wrappers/VaultJetton';
import { JettonMaster, JettonWallet, transferBodyWithPayload } from '../wrappers/Jetton';
import { VaultNative } from '../wrappers/VaultNative';
import { VaultExtra } from '../wrappers/VaultExtra';

enum COMMANDS {
    DEPLOY_POOL,
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
    async function selectCommand() {
        return await ui.choose(
            'Select command',
            Object.values(COMMANDS).filter(it => typeof(it) === 'number').map(it => it as number),
            (x) => COMMANDS[x].toString()
        )
    }
    let command = await selectCommand()

    let actions: SenderArguments[] = []
    while (true) {
        if (command == COMMANDS.DEPLOY_POOL) {
            const amm = await ui.choose(
                'Select AMM',
                Object.values(AMM).filter(it => typeof(it) === 'number').map(it => it as number),
                (x) => AMM[x].toString()
            )
            let ammSettingsParser: () => Promise<Cell | null>
            let extraSettingsParser: () => Promise<Cell | null>
            if (amm == AMM.ConstantProduct) {
                ammSettingsParser = async () => null
                extraSettingsParser = async () => null
            } else if (amm == AMM.CurveFiStable) {
                ammSettingsParser = async () => {
                    const amplification = BigInt(await ui.input('Enter amplification'))
                    const firstAssetWeight = BigInt(await ui.input('Enter 1st asset weight'))
                    const secondAssetWeight = BigInt(await ui.input('Enter 2nd asset weight'))
                    return beginCell()
                        .storeUint(amplification, 16)
                        .storeCoins(firstAssetWeight)
                        .storeCoins(secondAssetWeight)
                        .endCell()
                }
                extraSettingsParser = async () => null
            } else {
                throw new Error('Unknown AMM')
            }
            const firstAsset = parseAsset(
                await ui.input('Enter 1st asset (empty for TON, address for jetton, number for extra)')
            )
            const firstAssetVaultAddress = await factory.getVaultAddress(firstAsset)
            const firstAssetVault = openVault(provider, firstAsset, firstAssetVaultAddress)
            if ((await firstAssetVault.getIsActive()) == 0n) {
                throw new Error('Vault for 1st asset is not active')
            }
            const secondAsset = parseAsset(
                await ui.input('Enter 2nd asset (empty for TON, address for jetton, number for extra)')
            )
            const secondAssetVaultAddress = await factory.getVaultAddress(secondAsset)
            const secondAssetVault = openVault(provider, secondAsset, secondAssetVaultAddress)
            if ((await secondAssetVault.getIsActive()) == 0n) {
                throw new Error('Vault for 2nd asset is not active')
            }
            const ammSettings = await ammSettingsParser()
            const extraSettings = await extraSettingsParser()
            const firstAssetAmount = BigInt(await ui.input('Enter 1st asset raw amount'))
            const secondAssetAmount = BigInt(await ui.input('Enter 2nd asset raw amount'))
            const isActive = parseYesNo(
                await ui.input('Should pool be active from the beginning ("y" / "n")?')
            )
            const recipient = await ui.inputAddress(
                'Enter recipient of LP tokens (leave empty for factory admin)',
                factoryAdminAddress
            )
            const poolParams = new PoolParams(firstAsset, secondAsset, amm, ammSettings)
            const creationParams = new PoolCreationParams(
                new PublicPoolCreationParams(recipient),
                new PrivatePoolCreationParams(isActive, extraSettings)
            )
            async function buildTx(asset: Asset, amount: bigint, vaultRaw: any): Promise<SenderArguments> {
                if (asset instanceof AssetNative) {
                    const vault = vaultRaw as VaultNative
                    return {
                        to: vault.address,
                        value: toNano(.1),
                        body: vault.buildCreatePoolNativeFromParams(amount, poolParams, creationParams)
                    }
                } else if (asset instanceof AssetJetton) {
                    const vault = vaultRaw as VaultJetton
                    const jettonMaster = provider.open(JettonMaster.createFromAddress(asset.getAddress()))
                    const jettonWalletAddress = await jettonMaster.getWalletAddress(factoryAdminAddress)
                    const jettonWallet = provider.open(JettonWallet.createFromAddress(jettonWalletAddress))
                    return {
                        to: jettonWalletAddress,
                        value: toNano(.15),
                        body: transferBodyWithPayload(
                            factoryAdminAddress,
                            vault.address,
                            amount,
                            toNano(.1),
                            jettonWallet.buildCreatePoolJettonFromParams(poolParams, creationParams)
                        )
                    }
                } else if (asset instanceof AssetExtra) {
                    const vault = vaultRaw as VaultExtra
                    return {
                        to: vault.address,
                        value: toNano(.1),
                        extracurrency: {
                            [Number(asset.id)]: amount
                        },
                        body: vault.buildCreatePoolExtraFromParams(poolParams, creationParams)
                    }
                } else {
                    throw new Error('Unknown asset type')
                }
            }
            actions.push(await buildTx(firstAsset, firstAssetAmount, firstAssetVault))
            actions.push(await buildTx(secondAsset, secondAssetAmount, secondAssetVault))
            break
        }
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
                let contractName, codeCell
                const contractType = initDataS.loadUint(2)
                if (contractType == 0) {
                    const vaultType = initDataS.loadUint(2)
                    if (vaultType == 0) {
                        contractName = 'Native vault'
                        codeCell = compiled.vaultNative
                    } else if (vaultType == 1) {
                        contractName = 'Jetton vault'
                        codeCell = compiled.vaultJetton
                    } else if (vaultType == 2) {
                        contractName = 'Extra vault'
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
                    Asset.fromSlice(initDataS)
                    Asset.fromSlice(initDataS)
                    const amm = initDataS.loadUint(3)
                    if (amm == 0) {
                        contractName = 'ConstantProduct pool'
                        codeCell = compiled.poolConstantProduct
                    } else if (amm == 1) {
                        contractName = 'CurveFiStable pool'
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
                console.log(
                    contractName,
                    'code cell will be changed from',
                    Cell.fromBoc(state.state.code as Buffer)[0].hash().toString('hex'),
                    'to',
                    codeCell.hash().toString('hex')
                )
            }
            if (parseYesNo(await ui.input('Do you want to update more contracts ("y" / "n")?'))) {
                continue
            } else {
                break
            }
        }
        if (command == COMMANDS.UPDATE_CODE_CELLS) {
            const compiled = await getCompiledCodes()
            const old = await factory.getCode()
            const first = buildFirstFactoryCodeCell(compiled)
            if (old[0].hash().toString('hex') !== first.hash().toString('hex')) {
                throw new Error('First code cell must be preserved!')
            }
            const second = buildSecondFactoryCodeCell(compiled)
            actions.push({
                to: factoryAddress,
                value: toNano(.05),
                body: factory.buildUpdateCodeCells(first, second)
            })
            console.log(
                'Second code cell will be changed from',
                old[1].hash().toString('hex'),
                'to',
                second.hash().toString('hex')
            )
            if (parseYesNo(await ui.input('Do you want to do something else ("y" / "n")?'))) {
                command = await selectCommand()
                continue
            } else {
                break
            }
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

function openVault(provider: NetworkProvider, asset: Asset, address: Address): OpenedContract<VaultNative | VaultJetton | VaultExtra> {
    if (asset instanceof AssetNative) {
        return provider.open(VaultNative.createFromAddress(address))
    } else if (asset instanceof AssetJetton) {
        return provider.open(VaultJetton.createFromAddress(address))
    } else {
        return provider.open(VaultExtra.createFromAddress(address))
    }
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