import {Address, beginCell, Cell, OpenedContract, toNano} from '@ton/core';
import {compile, NetworkProvider, UIProvider} from '@ton/blueprint';
import {Blockchain, SandboxContract, TreasuryContract} from "@ton/sandbox";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {getTransactionAccount} from "../wrappers/utils";
import {waitSeqNoChange} from "./utils";
import {compileCodes, lpWalletCode} from "../tests/utils";
import {Factory} from "../wrappers/Factory";
import {
    AMM,
    Asset, AssetNative,
    DepositLiquidityParams,
    DepositLiquidityParamsTrimmed,
    PoolParams, SwapParams,
    SwapStepParams
} from "../wrappers/types";
import {VaultNative} from "../wrappers/VaultNative";
import {Pool} from "../wrappers/Pool";

let initCode: Cell;
let vaultNativeCode: Cell;
let vaultJettonCode: Cell;
let vaultExtraCode: Cell;
let poolCode: Cell;
let liquidityDepositoryCode: Cell;
let poolCreatorCode: Cell;
let factoryCode: Cell;


export const NATIVE_ADDRESS = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

function addressToAsset(address: Address) {
    if (address.toRawString() == NATIVE_ADDRESS.toRawString()) {
        return null
    }
    return address
}

export async function parseInteger(ui: UIProvider, text: string) {
    while (true) {
        try {
            let x = Number.parseInt(await ui.input(text))
            if (Number.isNaN(x)) {
                throw new Error("Nan");
            }
            return x;
        } catch (Error) {
            console.log("Wrong number, try again")
        }
    }
}

async function sendMessage(provider: NetworkProvider,
                           factory: OpenedContract<Factory>,
                           input: Address | null,
                           inputAmount: bigint,
                           ssp: SwapStepParams) {
    if (input == null) {
        let vault = provider.open(VaultNative.createFromAddress(await factory.getVaultAddress(input)))

        await vault.sendSwapNative(
            provider.sender(),
            toNano('0.1') + inputAmount,
            inputAmount,
            ssp,
            new SwapParams(
                BigInt((1 << 30) * 2),
                null,
                null,
                null
            )
        )

    } else {
        let sender = provider.sender().address as Address;

        let wallet =
            provider.open(
                JettonWallet.createFromAddress(
                    await provider.open(JettonMaster.createFromAddress(input)).getWalletAddress(sender)
                )
            )
        let vault = await factory.getVaultAddress(input)

        await wallet.sendSwapJetton(provider.sender(), toNano('0.1'), vault, inputAmount,
            ssp,
            new SwapParams(
                BigInt((1 << 30) * 2),
                null,
                null,
                null
            )
        )

    }
}

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();
    initCode = compiled.init;
    vaultNativeCode = compiled.vaultNativeCode;
    vaultJettonCode = compiled.vaultJettonCode;
    vaultExtraCode = compiled.vaultExtraCode;
    poolCode = compiled.poolCode;
    liquidityDepositoryCode = compiled.liquidityDepositoryCode;
    poolCreatorCode = compiled.poolCreatorCode;
    factoryCode = compiled.factoryCode;

    let deployer = provider.sender().address as Address;
    console.log("admin:", deployer);

    let factory = provider.open(
        Factory.createFromAddress(Address.parse("0:7ae4ce963255044de08b0d8f11465d4243273e939a0a9affef7da7abff040908"))
    );

    let tokens = ["T1", "T2", "T3"];
    let masters = [];

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(JettonMaster.createFromConfig({
            owner: deployer,
            name: tokens[i]
        }))
        masters.push(tokenMaster);
        console.log("Known token:", tokens[i], "address:", tokenMaster.address);
    }


    let pool = await factory.getPoolAddress(null, masters[0].address, AMM.CurveFiStable)
    console.log(pool.toRawString())
    console.log(
        await provider.open(
            Pool.createFromAddress(pool)
        ).getPoolData()
    )
    console.log(
        await provider.open(
            Pool.createFromAddress(pool)
        ).getJettonData()
    )
}
