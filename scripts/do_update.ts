import {Address, beginCell, Cell, OpenedContract, toNano} from '@ton/core';
import {compile, NetworkProvider, UIProvider} from '@ton/blueprint';
import {Blockchain, SandboxContract, TreasuryContract} from "@ton/sandbox";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {getTransactionAccount} from "../wrappers/utils";
import {waitSeqNoChange} from "./utils";
import {compileCodes, lpWalletCode} from "../tests/utils";
import {buildDataCell, Factory} from "../wrappers/Factory";
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

    let cell = buildDataCell(
        {
            admin: deployer,
            withdrawer: deployer,
            lpWalletCode: lpWalletCode,
            initCode: initCode,
            vaultNativeCode: vaultNativeCode,
            vaultJettonCode: vaultJettonCode,
            vaultExtraCode: vaultExtraCode,
            poolCode: poolCode,
            liquidityDepositoryCode: liquidityDepositoryCode,
            poolCreatorCode: poolCreatorCode
        }
    )

    await waitSeqNoChange(provider, deployer, async () => {
        await factory.sendUpdateCodeCell(provider.sender(), toNano(0.1), cell.refs[0])
    });

    await waitSeqNoChange(provider, deployer, async () => {
        await factory.sendUpdateContract(
            provider.sender(),
            toNano(0.1),
            Address.parse("0:2f2308218672ac5c80bde13cd8c22f74f7028bae8a241d225c411a1f165a7aec"),
            poolCode,
            null
        )
    });
}
