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

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();
    initCode = compiled.init;
    vaultNativeCode = compiled.vaultNativeCode;
    vaultJettonCode = compiled.vaultJettonCode;
    vaultExtraCode = compiled.vaultExtraCode;
    poolCode = compiled.poolCode;
    liquidityDepositoryCode = compiled.liquidityDepositoryCode;
    poolCreatorCode = compiled.poolCreatorCode;
    factoryCode = compiled.factoryCode;

    let deployer = provider.sender().address as Address;
    console.log("admin:", deployer);

    let factory = provider.open(
        Factory.createFromConfig(
            {
                admin: deployer,
                withdrawer: deployer,
                lpWalletCode: lpWalletCode,
                initCode: initCode,
                vaultNativeCode: vaultNativeCode,
                vaultJettonCode: vaultJettonCode,
                vaultExtraCode: vaultExtraCode,
                poolCode: poolCode,
                liquidityDepositoryCode: liquidityDepositoryCode,
                poolCreatorCode: poolCreatorCode
            },
            factoryCode
        )
    );
    if (await provider.isContractDeployed(factory.address)) {
        console.log('factory already deployed, address =', factory.address.toRawString());
        return;
    }
    console.log('factory address =', factory.address.toRawString());
    await factory.sendDeploy(provider.sender(), toNano('0.1'));
    await provider.waitForDeploy(factory.address);
}
