// noinspection JSUnusedGlobalSymbols

import {
    Address,
    beginCell,
    Builder,
    Cell, Slice
} from '@ton/core';

export enum AMM {
    ConstantProduct,
    CurveFiStable
}

export enum FailReason {
    SlippageTolerated,
    DeadlineReached,
    AlreadyExists
}

export abstract class CellSerializable {

    public abstract write(b: Builder): void;

    public toCell(): Cell {
        const b = beginCell();
        this.write(b);
        return b.endCell();
    }

}

export abstract class Asset extends CellSerializable {

    static fromSlice(slice: Slice): Asset {
        const type = slice.loadUint(2)
        if (type === 0) {
            return AssetNative.INSTANCE
        } else if (type === 1) {
            return new AssetJetton(slice.loadUintBig(8), slice.loadUintBig(256))
        } else if (type === 2) {
            return new AssetExtra(slice.loadUintBig(32))
        } else {
            throw new Error("unexpected asset type")
        }
    }

    static fromAny(value: any): Asset {
        if (value == null) {
            return AssetNative.INSTANCE
        } else if (value instanceof Address) {
            return AssetJetton.fromAddress(value);
        } else if (typeof value === "bigint") {
            return new AssetExtra(value)
        } else {
            throw new Error("unexpected asset type")
        }
    }

}

export class AssetNative extends Asset {

    static INSTANCE = new AssetNative();

    private constructor() {
        super();
    }

    public write(b: Builder): void {
        b.storeUint(0, 2);
    }
}

export class AssetJetton extends Asset {

    constructor(
        public chain: bigint,
        public hash: bigint
    ) {
        super();
    }

    static fromAddress(address: Address): AssetJetton {
        return new AssetJetton(
            BigInt(address.workChain),
            beginCell().storeBuffer(address.hash).endCell().beginParse().loadUintBig(256)
        );
    }

    public write(b: Builder): void {
        b.storeUint(1, 2)
            .storeUint(this.chain, 8)
            .storeUint(this.hash, 256);
    }
}

export class AssetExtra extends Asset {
    constructor(
        public id: bigint
    ) {
        super();
    }

    public write(b: Builder): void {
        b.storeUint(2, 2)
            .storeUint(this.id, 32);
    }
}

export class PoolParams extends CellSerializable {
    constructor(
        public first_asset: Asset,
        public second_asset: Asset,
        public amm: AMM
    ) {
        super()
    }

    static fromAddress(first_asset: Address | null, second_asset: Address | null, amm: AMM): PoolParams {
        return new PoolParams(
            first_asset === null ? AssetNative.INSTANCE : AssetJetton.fromAddress(first_asset),
            second_asset === null ? AssetNative.INSTANCE : AssetJetton.fromAddress(second_asset),
            amm
        );
    }

    public write(b: Builder): void {
        this.first_asset.write(b);
        this.second_asset.write(b);
        b.storeUint(this.amm, 3);
    }
}

export class NotificationDataSingle extends CellSerializable {
    constructor(
        public receiver: Address | null,
        public fwd_gas: bigint,
        public payload: Cell
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeAddress(this.receiver)
            .storeCoins(this.fwd_gas)
            .storeRef(this.payload)
    }
}

export class NotificationData extends CellSerializable {
    constructor(
        public on_success: NotificationDataSingle | null,
        public on_failure: NotificationDataSingle | null
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeMaybeRef(this.on_success?.toCell())
            .storeMaybeRef(this.on_failure?.toCell())
    }
}

export class Fee extends CellSerializable {
    constructor(
        public nominator: bigint
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeUint(this.nominator, 16)
    }
}

export class Fees extends CellSerializable {
    constructor(
        public input: Fee | null,
        public output: Fee | null,
        public first: Fee | null,
        public second: Fee | null
    ) {
        super()
    }

    public write(b: Builder): void {
        let flags = 0;
        if (this.input !== null) {
            flags += 1;
        }
        if (this.output !== null) {
            flags += 2;
        }
        if (this.first != null) {
            flags += 4;
        }
        if (this.second !== null) {
            flags += 8;
        }
        b.storeUint(flags, 4);
        this.input?.write(b);
        this.output?.write(b);
        this.first?.write(b);
        this.second?.write(b);
    }
}

export class PoolUpdateParams extends CellSerializable {
    constructor(
        public amm_settings: Cell | null,
        public protocol_fees: Fees | null,
        public referral_fees: Fees | null,
        public lp_fees: Fees | null,
        public is_active: boolean | null,
    ) {
        super()
    }

    public write(b: Builder): void {
        let flags = 0;
        if (this.amm_settings !== null) {
            flags += 1;
            b.storeRef(this.amm_settings!);
        }
        if (this.protocol_fees !== null) {
            flags += 2;
        }
        if (this.referral_fees !== null) {
            flags += 4;
        }
        if (this.lp_fees !== null) {
            flags += 8;
        }
        if (this.is_active !== null) {
            flags += 16;
        }
        b.storeUint(flags, 5);
        this.protocol_fees?.write(b);
        this.referral_fees?.write(b);
        this.lp_fees?.write(b);
        if (this.is_active !== null) {
            b.storeBit(this.is_active);
        }
    }
}

export class SwapParams extends CellSerializable {
    constructor(
        public deadline: bigint,
        public recipient: Address | null,
        public referral: Address | null,
        public notification_data: NotificationData | null
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeUint(this.deadline, 32)
            .storeAddress(this.recipient)
            .storeAddress(this.referral)
            .storeMaybeRef(this.notification_data?.toCell());
    }
}

export class SwapStepParams extends CellSerializable {
    constructor(
        public pool_address_hash: bigint,
        public min_output_amount: bigint,
        public next: SwapStepParams | null
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeUint(this.pool_address_hash, 256)
            .storeCoins(this.min_output_amount)
            .storeMaybeRef(this.next?.toCell());
    }
}

export class SwapStepParamsTrimmed extends CellSerializable {
    constructor(
        public min_output_amount: bigint,
        public next: SwapStepParams | null
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeCoins(this.min_output_amount)
            .storeMaybeRef(this.next?.toCell());
    }
}

export class SwapGenericFee extends CellSerializable {
    constructor(
        public input_amount: bigint,
        public output_amount: bigint
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeCoins(this.input_amount)
            .storeCoins(this.output_amount);
    }
}

export class SwapReferralFee extends CellSerializable {
    constructor(
        public referral: Address | null,
        public input_amount: bigint,
        public output_amount: bigint
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeAddress(this.referral)
            .storeCoins(this.input_amount)
            .storeCoins(this.output_amount);
    }
}

export class SwapFees extends CellSerializable {
    constructor(
        public lp: SwapGenericFee,
        public protocol: SwapGenericFee,
        public referral: SwapReferralFee | null
    ) {
        super()
    }

    public write(b: Builder): void {
        this.lp.write(b);
        this.protocol.write(b);
        b.storeMaybeRef(this.referral?.toCell());
    }
}

export class PoolReserves extends CellSerializable {
    constructor(
        public input_reserve: bigint,
        public output_reserve: bigint
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeCoins(this.input_reserve)
            .storeCoins(this.output_reserve);
    }
}

export class ChangedPoolReserves extends CellSerializable {
    constructor(
        public before: PoolReserves,
        public after: PoolReserves
    ) {
        super()
    }

    public write(b: Builder): void {
        this.before.write(b);
        this.after.write(b);
    }
}

export class DepositLiquidityParamsTrimmed extends CellSerializable {
    constructor(
        public deadline: bigint,
        public min_lp_amount: bigint,
        public recipient: Address | null,
        public referral: Address | null,
        public notification_data: NotificationData | null
    ) {
        super()
    }

    public write(b: Builder): void {
        b
            .storeAddress(this.recipient)
            .storeAddress(this.referral)
            .storeUint(this.deadline, 32)
            .storeUint(1, 2)
            .storeCoins(this.min_lp_amount)
            .storeMaybeRef(null)
            .storeMaybeRef(this.notification_data?.toCell());
        // b.storeUint(this.deadline, 32)
        //     .storeCoins(this.min_lp_amount)
        //     .storeAddress(this.recipient)
        //     .storeAddress(this.referral)
        //     .storeMaybeRef(this.notification_data?.toCell());
    }
}

export class DepositLiquidityParams extends CellSerializable {
    constructor(
        public params: DepositLiquidityParamsTrimmed,
        public pool_params: PoolParams
    ) {
        super()
    }

    public write(b: Builder): void {
        b.storeRef(this.params.toCell())
            .storeRef(this.pool_params.toCell());
    }
}