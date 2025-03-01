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
            toNano(0.1) + inputAmount,
            inputAmount,
            ssp,
            new SwapParams(
                BigInt((1 << 30) * 2),
                provider.sender().address as Address,
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

        await wallet.sendSwapJetton(provider.sender(), toNano(0.1), vault, inputAmount,
            ssp,
            new SwapParams(
                BigInt((1 << 30) * 2),
                provider.sender().address as Address,
                null,
                null
            )
        )

    }
}

export async function run(provider: NetworkProvider) {
    let compiled = await compileCodes();

    let deployer = provider.sender().address as Address;
    console.log("admin:", deployer);

    let factory = provider.open(Factory.createFromData(deployer, compiled, deployer));
    const ui = provider.ui();
    console.log('Factory address:', factory.address.toRawString());

    let factoryAddress = await ui.inputAddress("Use either factory above, or custom address", factory.address);
    console.log("Selected factory: ", factoryAddress.toRawString());
    factory = provider.open(Factory.createFromAddress(factoryAddress));

    let tokens = ["T1", "T2", "T3"];

    for (let i = 0; i < tokens.length; i++) {
        let tokenMaster = provider.open(JettonMaster.createFromConfig({
            owner: deployer,
            name: tokens[i]
        }))
        console.log("Known token:", tokens[i], "address:", tokenMaster.address);
    }
    console.log("=======================")
    console.log("Token address for native:", NATIVE_ADDRESS.toRawString())


    const hopsCount = await parseInteger(ui, "Insert hop count");
    if (hopsCount == 0) {
        return;
    }

    let outputs: Asset[] = [];
    let amms: AMM[] = [];

    const tokenIn = addressToAsset(await ui.inputAddress("Insert first token for pool:"));
    outputs.push(Asset.fromAny(tokenIn));
    amms.push(0);

    const amountIn = BigInt(await parseInteger(ui, "Insert first amount"));
    for (let i = 0; i < hopsCount; i++) {
        console.log("Fill path #", (i + 1), "of", hopsCount)
        const tokenOut = addressToAsset(await ui.inputAddress("Insert second token for pool:"));
        const poolType = await ui.choose("Select pool type", [AMM.CurveFiStable, AMM.ConstantProduct], (x) => AMM[x].toString());
        outputs.push(Asset.fromAny(tokenOut));
        amms.push(poolType)
    }

    let next: SwapStepParams | null = null;
    for (let i = outputs.length - 1; i >= 1; i--) {
        let n = outputs[i];
        let c = outputs[i - 1];
        let a = amms[i];

        next = new SwapStepParams(
            await factory.getPoolAddressHash(n, c, a),
            0n,
            next
        )
    }

    await sendMessage(provider, factory, tokenIn, amountIn, next as SwapStepParams);

}
