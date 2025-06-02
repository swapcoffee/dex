import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    let deployer = provider.sender().address as Address;
    console.log('initiator:', deployer);

    let factoryAddress = await ui.inputAddress('Insert factory address');
    let admin = await ui.inputAddress('Insert new admin address');
    let factory = provider.open(Factory.createFromAddress(factoryAddress));
    console.log('Factory address:', factory.address.toRawString());
    console.log('New admin address:', admin.toRawString());
    let isCorrect = await ui.input('Is it correct? y - yes, n - no');
    if (isCorrect !== 'y' && isCorrect !== 'Y') {
        console.log('Aborted');
        return;
    }

    await factory.sendUpdateAdmin(provider.sender(), toNano(0.1), admin);
}
