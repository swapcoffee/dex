import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode, toNano
} from '@ton/core';
import {Opcodes} from "./utils";
import {
    DepositLiquidityParams,
    NotificationData,
    PoolCreationParams,
    PoolParams, PrivatePoolCreationParams, PublicPoolCreationParams,
    SwapParams,
    SwapStepParams
} from './types';
import { Maybe } from '@ton/core/dist/utils/maybe';

export type JettonConfig = {
    owner: Address,
    name: string
};

const masterCode = Cell.fromBoc(
    Buffer.from("b5ee9c7201020d0100029c000114ff00f4a413f4bcf2c80b0102016202030202cc040502037a600b0c02f1d906380492f81f000e8698180b8d8492f81f07d207d2018fd0018b8eb90fd0018fd001801698fe99ff6a2687d007d206a6a18400aa9385d47199a9a9b1b289a6382f97024817d207d006a18106840306b90fd001812881a282178050a502819e428027d012c678b666664f6aa7041083deecbef29385d7181406070093b5f0508806e0a84026a8280790a009f404b19e2c039e2d99924591960225e801e80196019241f200e0e9919605940f97ff93a0ef003191960ab19e2ca009f4042796d625999992e3f60101c036373701fa00fa40f82854120670542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c9f9007074c8cb02ca07cbffc9d05006c705f2e04aa1034545c85004fa0258cf16ccccc9ed5401fa403020d70b01c300915be30d0801a682102c76b9735270bae30235373723c0038e1a335035c705f2e04903fa403059c85004fa0258cf16ccccc9ed54e03502c0048e185124c705f2e049d4304300c85004fa0258cf16ccccc9ed54e05f05840ff2f009003e8210d53276db708010c8cb055003cf1622fa0212cb6acb1fcb3fc98042fb0001fe365f03820898968015a015bcf2e04b02fa40d3003095c821cf16c9916de28210d1735400708018c8cb055005cf1624fa0214cb6a13cb1f14cb3f23fa443070ba8e33f828440370542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c9f9007074c8cb02ca07cbffc9d0cf16966c227001cb01e2f4000a000ac98040fb00007dadbcf6a2687d007d206a6a183618fc1400b82a1009aa0a01e428027d012c678b00e78b666491646580897a007a00658064fc80383a6465816503e5ffe4e840001faf16f6a2687d007d206a6a183faa9040", 'hex')
)[0];
const walletCode = Cell.fromBoc(
    Buffer.from("b5ee9c7201021101000323000114ff00f4a413f4bcf2c80b0102016202030202cc0405001ba0f605da89a1f401f481f481a8610201d40607020120080900c30831c02497c138007434c0c05c6c2544d7c0fc03383e903e900c7e800c5c75c87e800c7e800c1cea6d0000b4c7e08403e29fa954882ea54c4d167c0278208405e3514654882ea58c511100fc02b80d60841657c1ef2ea4d67c02f817c12103fcbc2000113e910c1c2ebcb853600201200a0b0083d40106b90f6a2687d007d207d206a1802698fc1080bc6a28ca9105d41083deecbef09dd0958f97162e99f98fd001809d02811e428027d012c678b00e78b6664f6aa401f1503d33ffa00fa4021f001ed44d0fa00fa40fa40d4305136a1522ac705f2e2c128c2fff2e2c254344270542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f40431fa0020d749c200f2e2c4778018c8cb055008cf1670fa0217cb6b13cc80c0201200d0e009e8210178d4519c8cb1f19cb3f5007fa0222cf165006cf1625fa025003cf16c95005cc2391729171e25008a813a08209c9c380a014bcf2e2c504c98040fb001023c85004fa0258cf1601cf16ccc9ed5402f73b51343e803e903e90350c0234cffe80145468017e903e9014d6f1c1551cdb5c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c0327e401c1d3232c0b281f2fff274140371c1472c7cb8b0c2be80146a2860822625a019ad822860822625a028062849e5c412440e0dd7c138c34975c2c0600f1000d73b51343e803e903e90350c01f4cffe803e900c145468549271c17cb8b049f0bffcb8b08160824c4b402805af3cb8b0e0841ef765f7b232c7c572cfd400fe8088b3c58073c5b25c60063232c14933c59c3e80b2dab33260103ec01004f214013e809633c58073c5b3327b552000705279a018a182107362d09cc8cb1f5230cb3f58fa025007cf165007cf16c9718010c8cb0524cf165006fa0215cb6a14ccc971fb0010241023007cc30023c200b08e218210d53276db708010c8cb055008cf165004fa0216cb6a12cb1f12cb3fc972fb0093356c21e203c85004fa0258cf1601cf16ccc9ed54", 'hex')
)[0];

const masterCodeNoResolver = Cell.fromBoc(
    Buffer.from("b5ee9c72010209010001b0000114ff00f4a413f4bcf2c80b0102016202030202cc040502037a60070801ddd9910e38048adf068698180b8d848adf07d201800e98fe99ff6a2687d007d206a6a18400aa9385d471a1a9a80e00079702428a26382f97024fd207d006a18106840306b90fd001812081a282178042a906428027d012c678b666664f6aa7041083deecbef0bdd71812f83c207f9784060093dfc142201b82a1009aa0a01e428027d012c678b00e78b666491646580897a007a00658064907c80383a6465816503e5ffe4e83bc00c646582ac678b28027d0109e5b589666664b8fd80400fc03fa00fa40f82854120870542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c9f9007074c8cb02ca07cbffc9d05008c705f2e04a12a1035024c85004fa0258cf16ccccc9ed5401fa403020d70b01c3008e1f8210d53276db708010c8cb055003cf1622fa0212cb6acb1fcb3fc98042fb00915be2007dadbcf6a2687d007d206a6a183618fc1400b82a1009aa0a01e428027d012c678b00e78b666491646580897a007a00658064fc80383a6465816503e5ffe4e8400023af16f6a2687d007d206a6a1811e0002a9040", 'hex')
)[0];
const walletCodeNoResolver = Cell.fromBoc(
    Buffer.from("b5ee9c7201021201000328000114ff00f4a413f4bcf2c80b0102016202030202cc0405001ba0f605da89a1f401f481f481a8610201d40607020148080900bb0831c02497c138007434c0c05c6c2544d7c0fc02f83e903e900c7e800c5c75c87e800c7e800c00b4c7e08403e29fa954882ea54c4d167c0238208405e3514654882ea58c511100fc02780d60841657c1ef2ea4d67c02b817c12103fcbc2000113e910c1c2ebcb853600201200a0b020120101101f500f4cffe803e90087c007b51343e803e903e90350c144da8548ab1c17cb8b04a30bffcb8b0950d109c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c032483e401c1d3232c0b281f2fff274013e903d010c7e801de0063232c1540233c59c3e8085f2dac4f3208405e351467232c7c6600c03f73b51343e803e903e90350c0234cffe80145468017e903e9014d6f1c1551cdb5c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c0327e401c1d3232c0b281f2fff274140371c1472c7cb8b0c2be80146a2860822625a020822625a004ad822860822625a028062849f8c3c975c2c070c008e00d0e0f009acb3f5007fa0222cf165006cf1625fa025003cf16c95005cc2391729171e25008a813a08208989680aa008208989680a0a014bcf2e2c504c98040fb001023c85004fa0258cf1601cf16ccc9ed5400705279a018a182107362d09cc8cb1f5230cb3f58fa025007cf165007cf16c9718018c8cb0524cf165006fa0215cb6a14ccc971fb0010241023000e10491038375f040076c200b08e218210d53276db708010c8cb055008cf165004fa0216cb6a12cb1f12cb3fc972fb0093356c21e203c85004fa0258cf1601cf16ccc9ed5400db3b51343e803e903e90350c01f4cffe803e900c145468549271c17cb8b049f0bffcb8b0a0822625a02a8005a805af3cb8b0e0841ef765f7b232c7c572cfd400fe8088b3c58073c5b25c60063232c14933c59c3e80b2dab33260103ec01004f214013e809633c58073c5b3327b55200083200835c87b51343e803e903e90350c0134c7e08405e3514654882ea0841ef765f784ee84ac7cb8b174cfcc7e800c04e81408f214013e809633c58073c5b3327b5520", 'hex')
)[0];


export function buildDataCell(config: JettonConfig, walletCode: Cell): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.owner)
        .storeRef(beginCell().storeStringTail(config.name).endCell())
        .storeRef(walletCode)
        .endCell();
}

export class JettonMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    static createFromConfig(config: JettonConfig, workchain = 0) {
        const data = buildDataCell(config, walletCode);
        const code = masterCode;
        const init = {code, data};
        return new JettonMaster(contractAddress(workchain, init), init);
    }

    static createFromConfigNoResolver(config: JettonConfig, workchain = 0) {
        const data = buildDataCell(config, walletCodeNoResolver);
        const code = masterCodeNoResolver;
        const init = {code, data};
        return new JettonMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body
        });
    }

    async sendMint(provider: ContractProvider, via: Sender, value: bigint, to: Address, amount: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: mintBody(to, amount)
        });
    }

    async getWalletAddress(provider: ContractProvider, forTonWalletAddress: Address): Promise<Address> {
        const res = await provider.get("get_wallet_address", [
            {
                type: "slice",
                cell: beginCell()
                    .storeAddress(forTonWalletAddress)
                    .endCell(),
            },
        ]);
        return res.stack.readAddress();
    }
}

export class JettonWallet implements Contract {
    constructor(readonly address: Address) {
    }

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body
        });
    }

    async sendTransfer(provider: ContractProvider, via: Sender, value: bigint, to: Address, amount: bigint) {
        await this.sendMessage(provider, via, value, transferBody(to, amount));
    }

    async sendTransferWithPayload(provider: ContractProvider, via: Sender, value: bigint, to: Address, amount: bigint, payload: Cell) {
        await this.sendMessage(provider, via, value, transferBodyWithPayload(via.address, to, amount, value - toNano(.035), payload));
    }

    async getWalletBalance(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get("get_wallet_data", []);
        return res.stack.readBigNumber();
    }

    async sendSwapJetton(provider: ContractProvider, via: Sender, value: bigint, vault: Address, amount: bigint, stepParams: SwapStepParams, params: SwapParams) {
        const b = beginCell().storeUint(0xc0ffee10, 32);
        stepParams.write(b);
        b.storeRef(params.toCell());
        await this.sendTransferWithPayload(provider, via, value, vault, amount, b.endCell());
    }

    async sendCreatePoolJetton(provider: ContractProvider, via: Sender, value: bigint, vault: Address, amount: bigint, recipient: Address, params: PoolParams, notification_data: NotificationData | null) {
        await this.sendCreatePoolJettonFromParams(
            provider,
            via,
            value,
            vault,
            amount,
            params,
            new PoolCreationParams(
                new PublicPoolCreationParams(recipient, notification_data),
                new PrivatePoolCreationParams(true, null)
            )
        )
    }

    async sendCreatePoolJettonFromParams(provider: ContractProvider, via: Sender, value: bigint, vault: Address, amount: bigint, params: PoolParams, creation_params: PoolCreationParams) {
        const b = beginCell()
            .storeUint(0xc0ffee11, 32)
        params.write(b)
        creation_params.write(b)
        await this.sendTransferWithPayload(provider, via, value, vault, amount, b.endCell());
    }

    async sendDepositLiquidityJetton(provider: ContractProvider, via: Sender, value: bigint, vault: Address, amount: bigint, params: DepositLiquidityParams) {
        const b = beginCell().storeUint(0xc0ffee12, 32);
        params.write(b);
        await this.sendTransferWithPayload(provider, via, value, vault, amount, b.endCell());
    }

    async sendBurnTokens(provider: ContractProvider, via: Sender, value: bigint, amount: bigint) {
        let b = burnBody(via.address as Address, amount, null);
        await this.sendMessage(provider, via, value, b);
    }
}

export function mintBody(ownerAddress: Address, jettonValue: bigint): Cell {
    return beginCell()
        .storeUint(Opcodes.mint, 32)
        .storeUint(0, 64)
        .storeAddress(ownerAddress)
        .storeCoins(toNano(0.05))
        .storeRef(
            // internal transfer message
            beginCell()
                .storeUint(Opcodes.internalTransfer, 32)
                .storeUint(0, 64)
                .storeCoins(jettonValue)
                .storeAddress(null)
                .storeAddress(null)
                .storeCoins(0)
                .storeBit(false)
                .endCell()
        )
        .endCell();
}

export function transferBody(toOwnerAddress: Address, jettonValue: bigint): Cell {
    return beginCell()
        .storeUint(Opcodes.transfer, 32)
        .storeUint(0, 64) // queryid
        .storeCoins(jettonValue)
        .storeAddress(toOwnerAddress)
        .storeAddress(null) //
        .storeDict(null) // custom payload
        .storeCoins(0) // forward ton amount
        .storeMaybeRef(null) // forward payload
        .endCell();
}

export function transferBodyWithPayload(myAddress: Address | undefined, toOwnerAddress: Address, jettonValue: bigint, refGas: bigint, payload: Cell): Cell {
    return beginCell()
        .storeUint(Opcodes.transfer, 32)
        .storeUint(0, 64) // queryid
        .storeCoins(jettonValue)
        .storeAddress(toOwnerAddress)
        .storeAddress(myAddress) //
        .storeDict(null) // custom payload
        .storeCoins(refGas) // forward ton amount
        .storeMaybeRef(payload) // forward payload
        .endCell();
}

export function burnBody(ownerAddress: Address, amount: bigint, payload: Cell | null): Cell {
    return beginCell()
        .storeUint(Opcodes.burn, 32)
        .storeUint(0, 64)
        .storeCoins(amount)
        .storeAddress(ownerAddress)
        .storeMaybeRef(payload)
        .endCell();
}
