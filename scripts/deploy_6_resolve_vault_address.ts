import { Address, OpenedContract, toNano } from '@ton/core';
import { NetworkProvider, sleep, UIProvider } from '@ton/blueprint';
import { JettonMaster, JettonWallet } from '../wrappers/Jetton';
import { compileCodes } from '../tests/utils';
import { Factory } from '../wrappers/Factory';
import { AMM, Asset, SwapParams, SwapStepParams } from '../wrappers/types';
import { VaultNative } from '../wrappers/VaultNative';
import { VaultJetton } from '../wrappers/VaultJetton';

export const NATIVE_ADDRESS = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

function addressToAsset(address: Address) {
    if (address.toRawString() == NATIVE_ADDRESS.toRawString()) {
        return null;
    }
    return address;
}

export async function parseInteger(ui: UIProvider, text: string) {
    while (true) {
        try {
            let x = Number.parseInt(await ui.input(text));
            if (Number.isNaN(x)) {
                throw new Error('Nan');
            }
            return x;
        } catch (Error) {
            console.log('Wrong number, try again');
        }
    }
}

async function sendMessage(
    provider: NetworkProvider,
    factory: OpenedContract<Factory>,
    input: Address | null,
    inputAmount: bigint,
    ssp: SwapStepParams,
) {
    if (input == null) {
        let vault = provider.open(VaultNative.createFromAddress(await factory.getVaultAddress(input)));

        await vault.sendSwapNative(
            provider.sender(),
            toNano(0.1) + inputAmount,
            inputAmount,
            ssp,
            new SwapParams(BigInt((1 << 30) * 2), provider.sender().address as Address, null, null),
        );
    } else {
        let sender = provider.sender().address as Address;

        let wallet = provider.open(
            JettonWallet.createFromAddress(
                await provider.open(JettonMaster.createFromAddress(input)).getWalletAddress(sender),
            ),
        );
        let vault = await factory.getVaultAddress(input);

        await wallet.sendSwapJetton(
            provider.sender(),
            toNano(0.1),
            vault,
            inputAmount,
            ssp,
            new SwapParams(BigInt((1 << 30) * 2), provider.sender().address as Address, null, null),
        );
    }
}

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();

    let deployer = provider.sender().address as Address;
    console.log('interact as:', deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer, 0, 239));
    const ui = provider.ui();
    console.log('Factory address:', factory.address.toString());

    let factoryAddress = await ui.inputAddress('Use either factory above, or custom address', factory.address);
    console.log('Selected factory: ', factoryAddress.toRawString());
    factory = provider.open(Factory.createFromAddress(factoryAddress));

    let tokens = [
        'EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE',
        'EQB-ajMyi5-WKIgOHnbOGApfckUGbl6tDk3Qt8PKmb-xLAvp',
        'EQBSo8lV6tIVCR6IouNWCaL__QEzhvvKEH_pGeHQHPFPL2T2',
        'EQBiJ8dSbp3_YAb_KuC64zCrFqQTsFbUee5tbzr5el_HEDGE',
        'EQC7js8NLX3v57ZuRmuusNtMSBdki4va_qyL7sAwdmosf_xK',
        'EQBh4XMahI9T81bj2DbAd97ZLQDoHM2rv2U5B59DVZkVN1pl',
        'EQDCJL0iQHofcBBvFBHdVG233Ri2V4kCNFgfRT-gqAd3Oc86',
        'EQBj7uoIVsngmS-ayOz1nHENjZkjTt5mXB4uGa83hmcqq2wA',
        'EQAfF5j3JMIpZlLmACv7Ub7RH7WmiVMuV4ivcgNYHvNnqHTz',
        'EQC7N-Y9tOG_5V6h7B4w52LN5Y82Kmx3Qbn3fAa1psINLI_L',
        'EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIw',
        'EQCtnNdPnA4NTt4XQ_M21dKyoUR7da_SX7uqtO-wh1HeqsX4',
        'EQCJbp0kBpPwPoBG-U5C-cWfP_jnksvotGfArPF50Q9Qiv9h',
    ];

    for (let i = 0; i < tokens.length; i++) {
        let tokenAddress = Address.parse(tokens[i]);
        console.log("Start work for: ", tokenAddress);
        let tokenVaultAddress = await factory.getVaultAddress(tokenAddress);

        let tokenVault = provider.open(VaultJetton.createFromAddress(tokenVaultAddress));
        console.log("Vault:", tokenVault);
        let isActive = await tokenVault.getIsActive();
        if (isActive) {
            console.error('Vault is already active, address:', tokenVaultAddress.toRawString());
            continue;
        }
        let token = provider.open(JettonMaster.createFromAddress(tokenAddress));
        let vaultJettonAddress = await token.getWalletAddress(tokenVaultAddress);
        await factory.sendActivateVault(provider.sender(), toNano(0.05), tokenAddress, vaultJettonAddress);
        await sleep(5_000);

    }
}
