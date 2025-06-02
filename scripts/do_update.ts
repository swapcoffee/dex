import { Address, beginCell, Cell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { waitSeqNoChange } from './utils';
import { compileCodes } from '../tests/utils';
import { buildDataCell, Factory } from '../wrappers/Factory';
import { Asset, AssetNative } from '../wrappers/types';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    let compiled = await compileCodes();
    let deployer = provider.sender().address as Address;
    console.log('admin:', deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer, 0, 239));

    console.log('Factory address:', factory.address.toRawString());
    let factoryAddress = await ui.inputAddress('Use either factory above, or custom address', factory.address);
    console.log('Selected factory: ', factoryAddress.toRawString(), '/', factoryAddress);
    factory = provider.open(Factory.createFromAddress(factoryAddress));

    while (true) {
        let nextAddress = await ui.inputAddress('Insert next address to update');
        if (nextAddress.toRawString() == factory.address.toRawString()) {
            console.log('Begin factory updating');
            let dataCell = buildDataCell(deployer, Address.parse("UQBQwb1rPdTP0DtL6FgW2ilaeoPsXuUEb1dPD4ynq2WT_DEX"), compiled, 239);
            await waitSeqNoChange(provider, deployer, async () => {
                await factory.sendUpdateContract(provider.sender(), toNano(0.1), null, compiled.factory, dataCell);
            });
        } else {
            let state = await provider.provider(nextAddress).getState();
            if (state.state.type !== 'active') {
                console.log('Wrong state for address:', nextAddress, 'state:', state.state);
                continue;
            }
            let dataCell = Cell.fromBoc(state.state.data as Buffer)[0];
            let cs = dataCell.beginParse();
            cs.loadRef();
            let initDataS = cs.loadRef().beginParse();
            let currentFactoryAddress = initDataS.loadAddress();
            let contractType = initDataS.loadUint(2);
            if (currentFactoryAddress.toRawString() != factoryAddress.toRawString()) {
                console.log(
                    'Unknown factory, expected:',
                    factoryAddress.toRawString(),
                    'got:',
                    currentFactoryAddress.toRawString(),
                );
                continue;
            }
            if (contractType == 0) {
                let vaultType = initDataS.loadUint(2);
                let codeCell;
                if (vaultType == 0) {
                    codeCell = compiled.vaultNative;
                } else if (vaultType == 1) {
                    codeCell = compiled.vaultJetton;
                } else if (vaultType == 2) {
                    codeCell = compiled.vaultExtra;
                } else {
                    throw Error('Unknown type: ' + vaultType);
                }
                await waitSeqNoChange(provider, deployer, async () => {
                    await factory.sendUpdateContract(provider.sender(), toNano(0.1), nextAddress, codeCell, null);
                });
            } else if (contractType == 1) {
                Asset.fromSlice(initDataS);
                Asset.fromSlice(initDataS);
                let amm = initDataS.loadUint(3);
                let codeCell;
                if (amm == 0) {
                    codeCell = compiled.poolConstantProduct;
                } else if (amm == 1) {
                    codeCell = compiled.poolCurveFiStable;
                } else {
                    throw new Error('Unknown amm');
                }
                await waitSeqNoChange(provider, deployer, async () => {
                    await factory.sendUpdateContract(provider.sender(), toNano(0.1), nextAddress, codeCell, null);
                });
            } else if (contractType == 2) {
                throw Error('Plz implement liquidity_depository modification');
            } else if (contractType == 3) {
                throw Error('Plz implement pool_creator modification');
            } else {
                throw Error('Unknown type: ' + contractType);
            }
        }
    }
}
