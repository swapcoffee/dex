import {Address, toNano} from '@ton/core';
import {NetworkProvider} from '@ton/blueprint';
import {JettonMaster} from "../wrappers/Jetton";
import {compileCodes} from "../tests/utils";
import {Factory} from "../wrappers/Factory";
import { parseAsset } from './utils';

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();

    let deployer = provider.sender().address as Address;
    console.log('admin:', deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer));
    const ui = provider.ui();
    console.log('Factory address:', factory.address.toRawString());

    let factoryAddress = await ui.inputAddress('Use either factory above, or custom address', factory.address);
    console.log('Selected factory: ', factoryAddress.toRawString());
    factory = provider.open(Factory.createFromAddress(factoryAddress));

    let tokens = ['T1', 'T2', 'T3'];

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(
            JettonMaster.createFromConfig({
                owner: deployer,
                name: tokens[i],
            }),
        );
        console.log('Known token:', tokens[i], 'address:', tokenMaster.address);
    }

    const tokenForVault = await parseAsset(ui, 'Insert token for vault:');
    let vaultAddress = await factory.getVaultAddress(tokenForVault);

    if (await provider.isContractDeployed(vaultAddress)) {
        console.log('Vault deployed, address =', vaultAddress.toRawString());
        return;
    }
    console.log('Vault address to be deployed at address  =', vaultAddress.toRawString());
    await factory.sendCreateVault(provider.sender(), toNano(0.1), tokenForVault);
    await provider.waitForDeploy(vaultAddress);
}
