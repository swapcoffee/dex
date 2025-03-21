import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { compileCodes } from '../tests/utils';
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
