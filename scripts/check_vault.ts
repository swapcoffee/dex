import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';
import { Factory } from '../wrappers/Factory';
import { Asset, AssetJetton, AssetNative } from '../wrappers/types';
import { JettonMaster, JettonWallet } from '../wrappers/Jetton';

const factoryAddress = Address.parse('EQAsf2sDPfoo-0IjnRA7l_gJBB9jyo4zqfCG_1IFCCI_Qbef')
const asset = AssetJetton.fromAddress(
    Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
)
const poolAddresses = [
    'EQDETPC2Trne37AQx7JKUIFA2G9uB3ifk4O7myFB6pwI6u8M',
    'EQAEL6u2qX8_kHLtVOGzukpspm9CLaHh0toancnzC5QnMe10',
    'EQBjj5LzN3L1PvFvH5mzbTc8zp3Sp_vSWmSI3nWKM-Fr3W_g',
    'EQAPKjgUay1cSBskf4-TElm60nMIKKj2wxrJtMAvL3wbtPHz',
    'EQB0lGWLrPbFqWGtcrcpybdpqnFZTvWfRIlJX9wlGzEMBscD'
].map(it => Address.parse(it))

export async function run(provider: NetworkProvider) {
    const factory = provider.open(Factory.createFromAddress(factoryAddress))
    const vaultAddress = await factory.getVaultAddress(asset)
    let reserveFromVault: bigint
    if (asset instanceof AssetNative) {
        const state = await provider.provider(vaultAddress).getState()
        reserveFromVault = state.balance
    } else if (asset instanceof AssetJetton) {
        const jettonMaster = provider.open(JettonMaster.createFromAddress(asset.getAddress()))
        const jettonWalletAddress = await jettonMaster.getWalletAddress(vaultAddress)
        const jettonWallet = provider.open(JettonWallet.createFromAddress(jettonWalletAddress))
        reserveFromVault = await jettonWallet.getWalletBalance()
    } else {
        throw new Error('Unsupported asset type')
    }
    console.log('Reserve from V', reserveFromVault)

    let reserveFromPools = 0n
    for (const poolAddress of poolAddresses) {
        const { stack } = await provider.provider(poolAddress).get('get_pool_data', [])
        stack.readNumber() // version
        const asset1 = Asset.fromSlice(stack.readCell().beginParse())
        const asset2 = Asset.fromSlice(stack.readCell().beginParse())
        stack.readNumber() // amm
        stack.readCellOpt() // amm_settings
        stack.readBoolean() // is_active
        const reserve1 = stack.readBigNumber()
        const reserve2 = stack.readBigNumber()
        if (asset1.toCell().hash().toString('hex') == asset.toCell().hash().toString('hex')) {
            reserveFromPools += reserve1
        } else if (asset2.toCell().hash().toString('hex') == asset.toCell().hash().toString('hex')) {
            reserveFromPools += reserve2
        } else {
            throw new Error('Unexpected pool address ' + poolAddress.toRawString())
        }
    }
    console.log('Reserve from P', reserveFromPools)
    console.log('Diff = ', reserveFromPools - reserveFromVault)
}