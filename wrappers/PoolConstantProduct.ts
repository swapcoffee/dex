import {Address, Cell} from '@ton/core';
import {PoolJettonBased} from "./PoolJettonBased";

export class PoolConstantProduct extends PoolJettonBased {
    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        super(address, init);
    }

    static createFromAddress(address: Address) {
        return new PoolConstantProduct(address);
    }
}
