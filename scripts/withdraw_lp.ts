import { NetworkProvider } from '@ton/blueprint';
import { Address, beginCell, Cell, toNano } from '@ton/core';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender()
    const ui = provider.ui()
    const factoryAddress = await ui.inputAddress(
        'Enter factory address',
        Address.parse('EQAsf2sDPfoo-0IjnRA7l_gJBB9jyo4zqfCG_1IFCCI_Qbef')
    )
    const targetAddress = await ui.inputAddress('Enter target address')
    const state = await provider.provider(targetAddress).getState()
    if (state.state.type !== 'active') {
        throw new Error('Wrong state for given address: ' + state.state.type)
    }
    const dataCell = Cell.fromBoc(state.state.data as Buffer)[0]
    const cs = dataCell.beginParse()
    cs.loadRef()
    const initDataS = cs.loadRef().beginParse()
    const currentFactoryAddress = initDataS.loadAddress()
    if (currentFactoryAddress.toRawString() !== factoryAddress.toRawString()) {
        throw new Error('Target is of another factory: ' + currentFactoryAddress.toRawString())
    }
    await sender.send({
        to: targetAddress,
        value: toNano(.05),
        body: beginCell()
            .storeUint(0xc0ffee07, 32)
            .storeUint(0, 64)
            .endCell()
    })
}