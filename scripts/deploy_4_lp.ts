import { Address, beginCell, Cell, OpenedContract, toNano } from '@ton/core';
import { NetworkProvider, UIProvider } from '@ton/blueprint';
import { JettonMaster, JettonWallet } from '../wrappers/Jetton';
import { compileCodes } from '../tests/utils';
import { Factory } from '../wrappers/Factory';
import { AMM, Asset, DepositLiquidityParams, DepositLiquidityParamsTrimmed, PoolParams } from '../wrappers/types';
import { VaultNative } from '../wrappers/VaultNative';

enum DepositOrProvide {
    CREATE_LP,
    PROVIDE_LP,
}

export const NATIVE_ADDRESS = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

function addressToAsset(address: Address) {
    if (address.toRawString() == NATIVE_ADDRESS.toRawString()) {
        return null;
    }
    return address;
}

export async function parseInteger(ui: UIProvider, text: string) {
    while (true) {
        try {
            return Number.parseInt(await ui.input(text));
        } catch (Error) {
            console.log('Wrong number, try again');
        }
    }
}

async function sendMessage(
    provider: NetworkProvider,
    factory: OpenedContract<Factory>,
    token1: Address | null,
    token2: Address | null,
    asset1: bigint,
    amm: AMM,
    ammSettings: Cell | null,
    depositOrProvide: DepositOrProvide,
) {
    if (token1 == null) {
        let vault = provider.open(VaultNative.createFromAddress(await factory.getVaultAddress(token1)));
        if (depositOrProvide == DepositOrProvide.CREATE_LP) {
            await vault.sendCreatePoolNative(
                provider.sender(),
                toNano(0.1) + asset1,
                asset1,
                provider.sender().address!!,
                new PoolParams(Asset.fromAny(token1), Asset.fromAny(token2), amm, ammSettings),
                null,
            );
        } else {
            await vault.sendDepositLiquidityNative(
                provider.sender(),
                toNano(0.1) + asset1,
                asset1,
                new DepositLiquidityParams(
                    new DepositLiquidityParamsTrimmed(BigInt((1 << 30) * 2), 0n, null, null, null),
                    PoolParams.fromAddress(token1, token2, amm, ammSettings),
                ),
            );
        }
    } else {
        let sender = provider.sender().address as Address;

        let wallet = provider.open(
            JettonWallet.createFromAddress(
                await provider.open(JettonMaster.createFromAddress(token1)).getWalletAddress(sender),
            ),
        );
        let vault = await factory.getVaultAddress(token1);
        if (depositOrProvide == DepositOrProvide.CREATE_LP) {
            await wallet.sendCreatePoolJetton(
                provider.sender(),
                toNano(0.1),
                vault,
                asset1,
                provider.sender().address!!,
                new PoolParams(Asset.fromAny(token1), Asset.fromAny(token2), amm, ammSettings),
                null,
            );
        } else {
            await wallet.sendDepositLiquidityJetton(
                provider.sender(),
                toNano(0.1),
                vault,
                asset1,
                new DepositLiquidityParams(
                    new DepositLiquidityParamsTrimmed(BigInt((1 << 30) * 2), 0n, null, null, null),
                    PoolParams.fromAddress(token1, token2, amm, ammSettings),
                ),
            );
        }
    }
}

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

    while (true) {
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
        console.log('=======================');
        console.log('Token address for native vault:', NATIVE_ADDRESS.toRawString());

        const tokenForPool1 = addressToAsset(await ui.inputAddress('Insert first token for pool:'));
        const tokenForPool2 = addressToAsset(await ui.inputAddress('Insert second token for pool:'));
        const poolType = await ui.choose('Select pool type', [AMM.CurveFiStable, AMM.ConstantProduct], (x) =>
            AMM[x].toString(),
        );

        let poolAddress = await factory.getPoolAddress(tokenForPool1, tokenForPool2, poolType);
        let isCreated = (await provider.isContractDeployed(poolAddress))
            ? DepositOrProvide.PROVIDE_LP
            : DepositOrProvide.CREATE_LP;

        const asset1 = BigInt(await parseInteger(ui, 'Insert first amount'));
        const asset2 = BigInt(await parseInteger(ui, 'Insert second amount'));

        console.log('Pool will be deployed at:', poolAddress.toRawString());
        console.log('Is pool created:', await provider.isContractDeployed(poolAddress), 'DepositOrProvide', isCreated);

        let ammSettings: Cell | null = null;
        if (poolType == AMM.CurveFiStable) {
            ammSettings = beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell();
        }

        await sendMessage(provider, factory, tokenForPool1, tokenForPool2, asset1, poolType, ammSettings, isCreated);
        if (isCreated == DepositOrProvide.CREATE_LP) {
            await provider.waitForDeploy(
                await factory.getPoolCreatorAddress(deployer, tokenForPool1, tokenForPool2, poolType),
                60,
            );
        } else {
            await provider.waitForDeploy(
                await factory.getLiquidityDepositoryAddress(deployer, tokenForPool1, tokenForPool2, poolType),
                60,
            );
        }
        await sendMessage(provider, factory, tokenForPool2, tokenForPool1, asset2, poolType, ammSettings, isCreated);
        await provider.waitForDeploy(await factory.getPoolAddress(tokenForPool1, tokenForPool2, poolType), 60);
    }
}
