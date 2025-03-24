import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {VaultJetton} from "../wrappers/VaultJetton";
import {CodeCells, compileCodes} from "./utils";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultNative} from "../wrappers/VaultNative";
import {
    AMM,
    AssetExtra,
    AssetJetton,
    AssetNative,
    PoolParams, SwapParams, SwapStepParams
} from "../wrappers/types";
import {VaultExtra} from "../wrappers/VaultExtra";
import {printTransactions} from "../wrappers/utils";
import { DEFAULT_TIMEOUT, deployJettonWithVault, deployNativeVault, JettonDataWithVault } from './helpers';

describe('Test', () => {
    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    }, DEFAULT_TIMEOUT);

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jetton1: JettonDataWithVault
    let nativeVault: SandboxContract<VaultNative>

    const stableAmmSettings = beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell()

    function resolveAmmSettings(amm: AMM): Cell | null {
        if (amm == AMM.ConstantProduct) {
            return null
        } else {
            return stableAmmSettings
        }
    }

    async function doSwap(
        sender: SandboxContract<TreasuryContract>,
        vault: SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra>,
        amount: bigint,
        swapStepParam: SwapStepParams,
        params: SwapParams
    ) {

        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendSwapNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                swapStepParam,
                params
            )
        } else if (asset instanceof AssetJetton) {
            let masterContract = blockchain.openContract(
                JettonMaster.createFromAddress(
                    new Address(
                        Number(asset.chain),
                        beginCell().storeUint(asset.hash, 256).endCell().beginParse().loadBuffer(32)
                    )
                )
            )
            let jettonVault = blockchain.openContract(
                JettonWallet.createFromAddress(
                    await masterContract.getWalletAddress(sender.address)
                )
            )
            return await jettonVault.sendSwapJetton(
                sender.getSender(),
                toNano(1),
                vault.address,
                amount,
                swapStepParam,
                params
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendSwapExtra(
                sender.getSender(),
                toNano(1),
                swapStepParam,
                params
            )
        } else {
            throw new Error("unexpected asset type")
        }
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(1000.0)});
        console.log('admin address =', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        await factory.sendDeploy(admin.getSender(), toNano(1.0));

        jetton1 = await deployJettonWithVault(
            blockchain,
            factory,
            admin,
            'TST1'
        )
        nativeVault = await deployNativeVault(blockchain, factory, admin)

        await nativeVault.sendCreatePoolNative(
            admin.getSender(),
            toNano(5),
            toNano(5),
            admin.address,
            new PoolParams(
                AssetNative.INSTANCE,
                AssetJetton.fromAddress(jetton1.master.address),
                AMM.ConstantProduct
            ),
            null
        );

        // native -> jetton1 stable
        {
            await jetton1.wallet.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                jetton1.vault.address,
                17n,
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.CurveFiStable,
                    stableAmmSettings
                ),
                null
            )
            await nativeVault.sendCreatePoolNative(
                admin.getSender(),
                toNano(6),
                1999n,
                admin.address,
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jetton1.master.address),
                    AMM.CurveFiStable,
                    stableAmmSettings
                ),
                null
            )
        }

    });

    test('test do stable swap forward', async () => {
        let vaultA = jetton1.vault;
        let vaultB = nativeVault;
        let amm = AMM.CurveFiStable;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vaultA.getAsset(),
                await vaultB.getAsset(),
                amm,
                resolveAmmSettings(amm)
            )
        )
        console.log(await pool.getPoolData());

        let txs = await doSwap(admin,
            vaultA,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultA.getAsset(), await vaultB.getAsset(), amm, resolveAmmSettings(amm)),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        expect(txs.transactions).toHaveTransaction(
            {
                to: pool.address,
                success: true,
                exitCode: 0
            }
        )
        printTransactions(txs.transactions)
    });

    test('test do stable swap backward', async () => {
        let vaultA = nativeVault;
        let vaultB = jetton1.vault;
        let amm = AMM.CurveFiStable;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vaultA.getAsset(),
                await vaultB.getAsset(),
                amm,
                resolveAmmSettings(amm)
            )
        )

        blockchain.setVerbosityForAddress(
            Address.parse("0:e9214ed692afb18f9e11190555db7e372329828df44dd4dffab8a0b14dd809fa"),
            {
                print: true,
                blockchainLogs: true,
                vmLogs: 'vm_logs_verbose',
                debugLogs: true
            });
        let txs = await doSwap(admin,
            vaultA,
            1000n,
            new SwapStepParams(
                await factory.getPoolAddressHash(await vaultA.getAsset(), await vaultB.getAsset(), amm, resolveAmmSettings(amm)),
                0n,
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction(
            {
                to: pool.address,
                success: true,
                exitCode: 0
            }
        )
    });

});
