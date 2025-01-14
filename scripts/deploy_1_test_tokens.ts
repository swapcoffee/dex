import {Address, toNano} from '@ton/core';
import {compile, NetworkProvider} from '@ton/blueprint';
import {Blockchain, SandboxContract, TreasuryContract} from "@ton/sandbox";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {getTransactionAccount} from "../wrappers/utils";
import {waitSeqNoChange} from "./utils";

export async function run(provider: NetworkProvider) {
    let deployer = provider.sender().address as Address;
    console.log("admin:", deployer);
    let tokens = ["T1", "T2", "T3"];

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(JettonMaster.createFromConfig({
            owner: deployer,
            name: tokens[i]
        }))
        if (!await provider.isContractDeployed(tokenMaster.address)) {
            await tokenMaster.sendDeploy(provider.sender(), toNano('0.1'))
            await provider.waitForDeploy(tokenMaster.address)
            console.log(tokens[i], "deployed to:", tokenMaster.address)
        } else {
            console.log(tokens[i], "already deployed to:", tokenMaster.address)
        }
    }

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(JettonMaster.createFromConfig({
            owner: deployer,
            name: tokens[i]
        }))
        await waitSeqNoChange(
            provider,
            deployer,
            () => {
                return tokenMaster.sendMint(provider.sender(), toNano('0.1'), deployer, toNano(100_000n))
            }
        )

    }
}
