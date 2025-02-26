import { Address, Cell, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { JettonMaster, JettonWallet } from '../wrappers/Jetton';
import { getTransactionAccount } from '../wrappers/utils';
import { waitSeqNoChange } from './utils';
import { compileCodes, lpWalletCode } from '../tests/utils';
import { Factory } from '../wrappers/Factory';

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();

    let deployer = provider.sender().address as Address;
    console.log('admin:', deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer));
    if (await provider.isContractDeployed(factory.address)) {
        console.log('factory already deployed, address =', factory.address.toRawString());
        return;
    }
    console.log('factory address =', factory.address.toRawString());
    await factory.sendDeploy(provider.sender(), toNano(0.1));
    await provider.waitForDeploy(factory.address);
}
