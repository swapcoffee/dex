import {Address, Cell, toNano} from '@ton/core';
import {compile, NetworkProvider} from '@ton/blueprint';
import {Blockchain, SandboxContract, TreasuryContract} from "@ton/sandbox";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {getTransactionAccount} from "../wrappers/utils";
import {waitSeqNoChange} from "./utils";
import {compileCodes, lpWalletCode} from "../tests/utils";
import {Factory} from "../wrappers/Factory";

let initCode: Cell;
let vaultNativeCode: Cell;
let vaultJettonCode: Cell;
let vaultExtraCode: Cell;
let poolCode: Cell;
let liquidityDepositoryCode: Cell;
let poolCreatorCode: Cell;
let factoryCode: Cell;

export const NATIVE_ADDRESS = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();


    let deployer = provider.sender().address as Address;
    console.log("admin:", deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer));
    const ui = provider.ui();
    console.log('Factory address:', factory.address.toRawString());

    let factoryAddress = await ui.inputAddress("Use either factory above, or custom address", factory.address);
    console.log("Selected factory: ", factoryAddress.toRawString());
    factory = provider.open(Factory.createFromAddress(factoryAddress));

    let tokens = ["T1", "T2", "T3"];

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(JettonMaster.createFromConfig({
            owner: deployer,
            name: tokens[i]
        }))
        console.log("Known token:", tokens[i], "address:", tokenMaster.address);
    }
    console.log("=======================")
    console.log("Token address for native vault:", NATIVE_ADDRESS.toRawString())
    const tokenForVault = await ui.inputAddress("Insert token for vault:")
    let vaultAddress: Address;
    if (tokenForVault.toRawString() == NATIVE_ADDRESS.toRawString()) {
        vaultAddress = await factory.getVaultAddress(null)
    } else {
        vaultAddress = await factory.getVaultAddress(tokenForVault);
    }
    if (await provider.isContractDeployed(vaultAddress)) {
        console.log('Vault deployed, address =', vaultAddress.toRawString());
        return;
    }
    console.log('Vault address to be deployed at address  =', vaultAddress.toRawString());

    if (tokenForVault.toRawString() == NATIVE_ADDRESS.toRawString()) {
        await factory.sendCreateVault(provider.sender(), toNano(0.1), null);
    } else {
        await factory.sendCreateVault(provider.sender(), toNano(0.1), tokenForVault);
    }
    await provider.waitForDeploy(vaultAddress);
}
