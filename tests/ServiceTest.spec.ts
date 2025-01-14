import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Factory} from "../wrappers/Factory";
import {printTransactions} from "../wrappers/utils";
import {VaultJetton} from "../wrappers/VaultJetton";
import {CodeCells, compileCodes, deployJetton} from "./utils";
import {JettonMaster, JettonWallet} from "../wrappers/Jetton";
import {VaultNative} from "../wrappers/VaultNative";
import {
    AMM,
    AssetNative,
    AssetJetton,
    AssetExtra,
    DepositLiquidityParams,
    DepositLiquidityParamsTrimmed, NotificationData, NotificationDataSingle,
    PoolParams, SwapParams, SwapStepParams
} from "../wrappers/types";
import {VaultExtra} from "../wrappers/VaultExtra";

/**
 * Набор тестов, покрывающих полный цикл взаимодействия юзера с протоколом
 * + 1) Депозит ликвидности в пулы
 * + 2) Снятие ликвидности из пулов
 * + 3) Обмен по пути Vault -> Pool -> Vault
 * + 4) Обмен по пути Vault -> Pool -> Pool -> Vault
 * + 5) Не удачный обмен по пути Vault -> Pool (получаем первый токен)
 * + 6) Не удачный обмен по пути Vault -> Pool -> Pool (получаем промежуточный токен)
 * + 7) Снятие ликвидности из пула после увеличения лп
 * + 8) Обмен по пути Vault -> Pool A,B,Volatile -> Pool B,A,Stable
 * + 9) Цикл Vault -> Pool A,B,V -> Pool B,A,V -> Vault
 * + 10) Цикл с неверным 2ым выходом Vault -> Pool A,B,V -> Pool A,A,V -> Fatal
 */
// native,jetton1,volatile
// native,jetton1,stable

// native,jetton2,stable

// jetton1,jetton2,stable
// jetton1,jetton2,volatile

// isolated
// jetton3,jetton4,stable
// jetton3,jetton4,volatile
describe('Test', () => {
    enum VaultTypes {
        NATIVE_VAULT,
        JETTON_VAULT_1,
        JETTON_VAULT_2,
        JETTON_VAULT_3,
        JETTON_VAULT_4,
    }

    let codeCells: CodeCells;
    beforeAll(async () => {
        codeCells = await compileCodes();
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;

    let jettonMaster1: SandboxContract<JettonMaster>;
    let jettonMaster2: SandboxContract<JettonMaster>;
    let jettonMaster3: SandboxContract<JettonMaster>;
    let jettonMaster4: SandboxContract<JettonMaster>;
    let vaultNative: SandboxContract<VaultNative>;
    let vaultJetton1: SandboxContract<VaultJetton>;
    let vaultJetton2: SandboxContract<VaultJetton>;
    let vaultJetton3: SandboxContract<VaultJetton>;
    let vaultJetton4: SandboxContract<VaultJetton>;

    function resolveVault(type: VaultTypes): SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra> {
        if (type == VaultTypes.NATIVE_VAULT) {
            return vaultNative
        } else if (type == VaultTypes.JETTON_VAULT_1) {
            return vaultJetton1
        } else if (type == VaultTypes.JETTON_VAULT_2) {
            return vaultJetton2
        } else if (type == VaultTypes.JETTON_VAULT_3) {
            return vaultJetton3
        } else if (type == VaultTypes.JETTON_VAULT_4) {
            return vaultJetton4
        } else {
            throw Error("Unknown type")
        }
    }

    async function depositLiquidity(
        sender: SandboxContract<TreasuryContract>,
        vault: SandboxContract<VaultNative> | SandboxContract<VaultJetton> | SandboxContract<VaultExtra>,
        amount: bigint,
        param: DepositLiquidityParams
    ) {
        const asset = await vault.getAssetParsed()
        if (asset instanceof AssetNative) {
            return await (vault as SandboxContract<VaultNative>).sendDepositLiquidityNative(
                sender.getSender(),
                amount + toNano(1),
                amount,
                param,
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
            return await jettonVault.sendDepositLiquidityJetton(
                sender.getSender(),
                toNano(1),
                vault.address,
                amount,
                param
            )
        } else if (asset instanceof AssetExtra) {
            return await (vault as SandboxContract<VaultExtra>).sendDepositLiquidityExtra(
                sender.getSender(),
                toNano(1),
                param,
            )
        } else {
            throw new Error("unexpected asset type")
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

    let allPools = [
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1, AMM.ConstantProduct],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_1, AMM.CurveFiStable],
        [VaultTypes.NATIVE_VAULT, VaultTypes.JETTON_VAULT_2, AMM.CurveFiStable],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2, AMM.CurveFiStable],
        [VaultTypes.JETTON_VAULT_1, VaultTypes.JETTON_VAULT_2, AMM.ConstantProduct],

        [VaultTypes.JETTON_VAULT_3, VaultTypes.JETTON_VAULT_4, AMM.CurveFiStable],
        [VaultTypes.JETTON_VAULT_3, VaultTypes.JETTON_VAULT_4, AMM.ConstantProduct],
    ];

    let allPoolsAllDirections =
        allPools.map(
            it => {
                return [
                    it,
                    [it[1], it[0], it[2]]
                ]
            }
        ).flat()

    let twoSwapDifferentPool =
        allPoolsAllDirections.map(
            it => {
                let from = it[0];
                let to = it[1];
                let amm = it[2];
                return allPoolsAllDirections.filter(jt => {
                    let from2 = jt[0];
                    let to2 = jt[1];
                    let amm2 = jt[2];
                    if (from == from2 && to == to2 && amm == amm2) {
                        return false;
                    }
                    if (to == from2 && from == to2 && amm == amm2) {
                        return false;
                    }
                    return (to == from2);

                }).map(jt => {
                    return [from, to, amm, jt[0], jt[1], jt[2]];
                });
            }
        )
            .flat();

    let twoSwapCycle =
        allPoolsAllDirections.map(
            it => {
                let from = it[0];
                let to = it[1];
                let amm = it[2];
                return allPoolsAllDirections.filter(jt => {
                    let from2 = jt[0];
                    let to2 = jt[1];
                    let amm2 = jt[2];
                    if (from == from2 && to == to2 && amm == amm2) {
                        return true;
                    }
                    return to == from2 && from == to2 && amm == amm2;

                }).map(jt => {
                    return [from, to, amm, jt[0], jt[1], jt[2]];
                });
            }
        )
            .flat();

    let twoSwapFromAToB = twoSwapCycle.concat(twoSwapDifferentPool)

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin', {balance: toNano(1000.0)});
        console.log('admin address =', admin.address.toRawString());
        factory = blockchain.openContract(
            Factory.createFromData(admin.address, codeCells)
        );
        await factory.sendDeploy(admin.getSender(), toNano(1.0));

        let deploy = await deployJetton(blockchain, admin, "TST1");
        jettonMaster1 = deploy.master;
        deploy = await deployJetton(blockchain, admin, "TST2");
        jettonMaster2 = deploy.master;
        deploy = await deployJetton(blockchain, admin, "TST3");
        jettonMaster3 = deploy.master;
        deploy = await deployJetton(blockchain, admin, "TST4");
        jettonMaster4 = deploy.master;

        await factory.sendCreateVault(admin.getSender(), toNano(.04), null);
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster1.address);
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster2.address);
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster3.address);
        await factory.sendCreateVault(admin.getSender(), toNano(.04), jettonMaster4.address);

        vaultNative = blockchain.openContract(VaultNative.createFromAddress(await factory.getVaultAddress(null)));
        vaultJetton1 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster1.address)));
        vaultJetton2 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster2.address)));
        vaultJetton3 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster3.address)));
        vaultJetton4 = blockchain.openContract(VaultJetton.createFromAddress(await factory.getVaultAddress(jettonMaster4.address)));

        let adminJettonWallet1 = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(jettonMaster1.address)).getWalletAddress(admin.address)
            )
        )
        let adminJettonWallet2 = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(jettonMaster2.address)).getWalletAddress(admin.address)
            )
        )

        let adminJettonWallet3 = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(jettonMaster3.address)).getWalletAddress(admin.address)
            )
        )

        let adminJettonWallet4 = blockchain.openContract(
            JettonWallet.createFromAddress(
                await blockchain.openContract(
                    JettonMaster.createFromAddress(jettonMaster4.address)).getWalletAddress(admin.address)
            )
        )

        // native -> jetton1 volatile
        {
            let txs = await adminJettonWallet1.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton1.address,
                toNano(5),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
            printTransactions(txs.transactions)
            txs = await vaultNative.sendCreatePoolNative(
                admin.getSender(),
                toNano(6),
                toNano(5),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
            printTransactions(txs.transactions)
        }

        // native -> jetton1 stable
        {
            await adminJettonWallet1.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton1.address,
                toNano(5),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
            await vaultNative.sendCreatePoolNative(
                admin.getSender(),
                toNano(6),
                toNano(5),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AMM.CurveFiStable
                ),
                beginCell()
                    .storeUint(2_000, 16)
                    .storeCoins(1)
                    .storeCoins(1)
                    .endCell(),
                null
            )
        }

        // native -> jetton2 stable
        {
            await adminJettonWallet2.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton2.address,
                toNano(5),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
            await vaultNative.sendCreatePoolNative(
                admin.getSender(),
                toNano(10),
                toNano(9),
                new PoolParams(
                    AssetNative.INSTANCE,
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.CurveFiStable
                ),
                beginCell()
                    .storeUint(2_000, 16)
                    .storeCoins(1)
                    .storeCoins(1)
                    .endCell(),
                null
            )
        }

        // jetton1 -> jetton2 stable
        {
            await adminJettonWallet1.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton1.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
            await adminJettonWallet2.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton2.address,
                toNano(20),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
        }

        // jetton1 -> jetton2 volatile
        {
            await adminJettonWallet1.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton1.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
            await adminJettonWallet2.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton2.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster1.address),
                    AssetJetton.fromAddress(jettonMaster2.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
        }

        // jetton3 -> jetton4 stable
        {
            await adminJettonWallet3.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton3.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster3.address),
                    AssetJetton.fromAddress(jettonMaster4.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
            await adminJettonWallet4.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton4.address,
                toNano(20),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster3.address),
                    AssetJetton.fromAddress(jettonMaster4.address),
                    AMM.CurveFiStable
                ),
                beginCell().storeUint(2_000, 16).storeCoins(1).storeCoins(1).endCell(),
                null
            )
        }

        // jetton3 -> jetton4 volatile
        {
            await adminJettonWallet3.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton3.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster3.address),
                    AssetJetton.fromAddress(jettonMaster4.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
            await adminJettonWallet4.sendCreatePoolJetton(admin.getSender(),
                toNano(1),
                vaultJetton4.address,
                toNano(10),
                new PoolParams(
                    AssetJetton.fromAddress(jettonMaster3.address),
                    AssetJetton.fromAddress(jettonMaster4.address),
                    AMM.ConstantProduct
                ),
                null,
                null
            )
        }

        console.log('factory address:', factory.address.toRawString(), '\n',
            'jettonMaster1:', jettonMaster1.address.toRawString(), '\n',
            'jettonMaster2:', jettonMaster2.address.toRawString(), '\n',
            'jettonMaster3:', jettonMaster3.address.toRawString(), '\n',
            'jettonMaster4:', jettonMaster4.address.toRawString(), '\n',

            'vaultNative:', vaultNative.address.toRawString(), '\n',
            'vaultJetton2:', vaultJetton2.address.toRawString(), '\n',
            'vaultJetton1:', vaultJetton1.address.toRawString(), '\n',
            'vaultJetton3:', vaultJetton3.address.toRawString(), '\n',
            'vaultJetton4:', vaultJetton4.address.toRawString(), '\n',
        );

    });

    test.each(allPools)('provide wallet address pool %i %i %i', async (a, b, c) => {
        let vaultA = resolveVault(a as VaultTypes);
        let vaultB = resolveVault(b as VaultTypes);
        let amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vaultA.getAsset(),
                await vaultB.getAsset(),
                amm
            )
        )

        let txs = await pool.sendProvideWalletAddress(admin.getSender(), toNano(1), admin.address)
        printTransactions(txs.transactions);
        expect(txs.transactions).toHaveTransaction(
            {
                from: admin.address,
                to: pool.address,
                exitCode: 0,
                success: true
            }
        )

        let poolAsJettonMaster = blockchain.openContract(JettonMaster.createFromAddress(pool.address));
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: admin.address,
                exitCode: 0,
                success: true,
                body: beginCell()
                    .storeUint(0xd1735400, 32)
                    .storeUint(0, 64)
                    .storeAddress(await poolAsJettonMaster.getWalletAddress(admin.address))
                    .storeMaybeRef(
                        beginCell()
                            .storeAddress(admin.address)
                            .endCell()
                    )
                    .endCell()
            }
        )
    });


    test.each(allPools)('deposit liq to pool %i %i %i', async (a, b, c) => {
        let vaultA = resolveVault(a as VaultTypes);
        let vaultB = resolveVault(b as VaultTypes);
        let amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vaultA.getAsset(),
                await vaultB.getAsset(),
                amm
            )
        )
        let beforePoolData = await pool.getJettonData();
        expect(beforePoolData.totalSupply).toBeGreaterThan(0n);

        let expectedLp = await pool.getEstimateLiquidityDepositAmount(toNano(1), toNano(1));

        // 178D4519000000000000000043B9ACA008002557BBB945D246A58F4C1A14AD8A350229606AA709B3305D75569CFAC53578BD0005F6D40E1F230EE15F58E6463BC94F40D7EC7FC5508B63D9DB82056B4AE1AC8481_
        let f = await depositLiquidity(admin, vaultA, toNano(1), new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                10n,
                admin.address,
                admin.address,
                new NotificationData(
                    new NotificationDataSingle(
                        admin.address,
                        0n,
                        beginCell().endCell()
                    ),
                    null
                )
            ),
            new PoolParams(
                await vaultA.getAssetParsed(),
                await vaultB.getAssetParsed(),
                amm
            )
        ))
        printTransactions(f.transactions)

        let s = await depositLiquidity(admin, vaultB, toNano(1), new DepositLiquidityParams(
            new DepositLiquidityParamsTrimmed(
                BigInt((1 << 30) * 2),
                10n,
                admin.address,
                admin.address,
                new NotificationData(
                    new NotificationDataSingle(
                        admin.address,
                        toNano("0.01"),
                        beginCell().endCell()
                    ),
                    null
                )
            ),
            new PoolParams(
                await vaultA.getAssetParsed(),
                await vaultB.getAssetParsed(),
                amm
            )
        ))
        printTransactions(s.transactions)

        let afterPoolData = await pool.getJettonData();
        expect(afterPoolData.totalSupply).toBeGreaterThan(beforePoolData.totalSupply);

        let adminLpWallet =
            blockchain.openContract(
                JettonWallet.createFromAddress(
                    await pool.getWalletAddress(admin.address)
                )
            );

        expect(s.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: adminLpWallet.address,
                success: true,
                exitCode: 0,
                body: beginCell()
                    .storeUint(0x178d4519, 32)
                    .storeUint(0, 64)
                    .storeCoins(expectedLp.lpAmount)
                    .storeAddress(pool.address)
                    .storeAddress(admin.address)
                    .storeCoins(toNano("0.01"))
                    .storeMaybeRef(beginCell().endCell())
                    .endCell()
            }
        )

    });

    test.each(allPools)('withdraw liq from pool %i %i %i', async (a, b, c) => {
        let vaultA = resolveVault(a as VaultTypes);
        let vaultB = resolveVault(b as VaultTypes);
        let amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vaultA.getAsset(),
                await vaultB.getAsset(),
                amm
            )
        )

        let beforePoolData = await pool.getJettonData();
        expect(beforePoolData.totalSupply).toBeGreaterThan(0n);

        let adminPoolLpWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await pool.getWalletAddress(admin.address)))
        let txs = await adminPoolLpWallet.sendBurnTokens(admin.getSender(), toNano(1), toNano(0.5));
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultA.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultB.address,
                success: true,
                exitCode: 0
            }
        )

        let afterPoolData = await pool.getJettonData();
        expect(afterPoolData.totalSupply).toBeLessThan(beforePoolData.totalSupply);
    });

    test.each(allPoolsAllDirections)
    ('do single swap, ok slippage %i %i %i', async (a, b, c) => {
        const vaultA = resolveVault(a as VaultTypes);
        const vaultB = resolveVault(b as VaultTypes);
        const assetA = await vaultA.getAsset();
        const assetB = await vaultB.getAsset();
        const amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(assetA, assetB, amm)
        )

        let swapInfo = await pool.getEstimateSwapAmount(
            await vaultA.getAsset(),
            toNano(1)
        )

        let before = await pool.getPoolData();
        let txs = await doSwap(admin,
            vaultA,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(assetA, assetB, amm),
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
        let after = await pool.getPoolData();
        expect(before.reserve2).not.toBe(after.reserve2);
        expect(before.reserve1).not.toBe(after.reserve1);
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultB.address,
                success: true,
                exitCode: 0,
                body: beginCell()
                    .storeUint(0xc0ffee21, 32)
                    .storeUint(0, 64)
                    .storeAddress(admin.address)
                    .storeCoins(swapInfo.outputAmount)
                    .storeMaybeRef(null)
                    .storeMaybeRef(beginCell()
                        .storeAddress(factory.address)
                        .storeUint(1, 2)
                        .storeSlice(after.asset1.asSlice())
                        .storeSlice(after.asset2.asSlice())
                        .storeUint(after.amm, 3)
                        .endCell())
                    .endCell()
            }
        )
    });

    test.each(allPoolsAllDirections)
    ('do single swap, then withdraw lp %i %i %i', async (a, b, c) => {
        const vaultA = resolveVault(a as VaultTypes);
        const vaultB = resolveVault(b as VaultTypes);
        const assetA = await vaultA.getAsset();
        const assetB = await vaultB.getAsset();
        const amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(assetA, assetB, amm)
        )
        let lpWithdrawBefore = await pool.getEstimateLiquidityWithdrawAmount(10_000n);

        await doSwap(admin,
            vaultA,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(assetA, assetB, amm),
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
        let lpWithdrawAfter = await pool.getEstimateLiquidityWithdrawAmount(10_000n);

        let poolData = await pool.getPoolData();

        let vaultAsset1 = await factory.getVaultAddress(poolData.asset1.asSlice())
        if (vaultA.address.toRawString() == vaultAsset1.toRawString()) {
            expect(lpWithdrawBefore.asset1).toBeLessThan(lpWithdrawAfter.asset1);
            expect(lpWithdrawBefore.asset2).toBeGreaterThan(lpWithdrawAfter.asset2);
        } else {
            expect(lpWithdrawBefore.asset2).toBeLessThan(lpWithdrawAfter.asset2);
            expect(lpWithdrawBefore.asset1).toBeGreaterThan(lpWithdrawAfter.asset1);
        }

        let adminPoolLpWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await pool.getWalletAddress(admin.address)))
        let txs = await adminPoolLpWallet.sendBurnTokens(admin.getSender(), toNano(1), 10_000n);

        let bodyAsset1 = beginCell()
            .storeUint(0xc0ffee21, 32)
            .storeUint(0, 64)
            .storeAddress(admin.address)
            .storeCoins(lpWithdrawAfter.asset1)
            .storeMaybeRef(null)
            .storeMaybeRef(beginCell()
                .storeAddress(factory.address)
                .storeUint(1, 2)
                .storeSlice(poolData.asset1.asSlice())
                .storeSlice(poolData.asset2.asSlice())
                .storeUint(poolData.amm, 3)
                .endCell())
            .endCell()
        let bodyAsset2 = beginCell()
            .storeUint(0xc0ffee21, 32)
            .storeUint(0, 64)
            .storeAddress(admin.address)
            .storeCoins(lpWithdrawAfter.asset2)
            .storeMaybeRef(null)
            .storeMaybeRef(beginCell()
                .storeAddress(factory.address)
                .storeUint(1, 2)
                .storeSlice(poolData.asset1.asSlice())
                .storeSlice(poolData.asset2.asSlice())
                .storeUint(poolData.amm, 3)
                .endCell())
            .endCell()

        if (vaultA.address.toRawString() != vaultAsset1.toRawString()) {
            let tmp = bodyAsset1;
            bodyAsset1 = bodyAsset2;
            bodyAsset2 = tmp;
        }
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultA.address,
                exitCode: 0,
                success: true,
                body: bodyAsset1
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultB.address,
                exitCode: 0,
                success: true,
                body: bodyAsset2
            }
        )
    });

    test.each(allPoolsAllDirections)
    ('do single swap, fail slippage %i %i %i', async (a, b, c) => {
        const vaultA = resolveVault(a as VaultTypes);
        const vaultB = resolveVault(b as VaultTypes);
        const assetA = await vaultA.getAsset();
        const assetB = await vaultB.getAsset();
        const amm = c as AMM;

        let pool = blockchain.openContract(
            await factory.getPoolJettonBased(assetA, assetB, amm)
        )

        let before = await pool.getPoolData();
        let txs = await doSwap(admin,
            vaultA,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(assetA, assetB, amm),
                toNano(1_000n),
                null
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        printTransactions(txs.transactions)
        let after = await pool.getPoolData();
        expect(before.reserve2).toBe(after.reserve2);
        expect(before.reserve1).toBe(after.reserve1);
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool.address,
                to: vaultA.address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each(twoSwapDifferentPool)
    ('do two swap, ok (%i %i %i) -> (%i %i %i)', async (fromVault, toVault, amm1Type,
                                                        pool2Vault1, pool2Vault2, amm2Type) => {

        const vault1A = resolveVault(fromVault as VaultTypes);
        const vault1B = resolveVault(toVault as VaultTypes);
        const amm1 = amm1Type as AMM;

        const vault2A = resolveVault(pool2Vault1 as VaultTypes);
        const vault2B = resolveVault(pool2Vault2 as VaultTypes);
        const amm2 = amm2Type as AMM;

        let vault2Output = vault2A === vault1B ? vault2B : vault2A;

        let pool1 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault1A.getAsset(),
                await vault1B.getAsset(),
                amm1
            )
        )
        let pool2 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault2A.getAsset(),
                await vault2B.getAsset(),
                amm2
            )
        )

        let before1 = await pool1.getPoolData();
        let before2 = await pool2.getPoolData();

        let txs = await doSwap(admin,
            vault1A,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(await vault1A.getAsset(), await vault1B.getAsset(), amm1),
                0n,
                new SwapStepParams(
                    await factory.getPoolAddressHash(await vault2A.getAsset(), await vault2B.getAsset(), amm2),
                    0n,
                    null
                )
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        printTransactions(txs.transactions);
        let after1 = await pool1.getPoolData();
        let after2 = await pool2.getPoolData();

        expect(before1.reserve1).not.toBe(after1.reserve1);
        expect(before1.reserve2).not.toBe(after1.reserve2);

        expect(before2.reserve1).not.toBe(after2.reserve1);
        expect(before2.reserve2).not.toBe(after2.reserve2);

        expect(txs.transactions).toHaveTransaction(
            {
                from: vault1A.address,
                to: pool1.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool1.address,
                to: pool2.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool2.address,
                to: vault2Output.address,
                success: true,
                exitCode: 0
            }
        )

        expect(pool1.address.toRawString()).not.toBe(pool2.address.toRawString())

    });

    test.each(twoSwapCycle)
    ('do two swap, cycle, ok (%i %i %i) -> (%i %i %i)', async (fromVault, toVault, amm1Type,
                                                               pool2Vault1, pool2Vault2, amm2Type) => {

        const vault1A = resolveVault(fromVault as VaultTypes);
        const vault1B = resolveVault(toVault as VaultTypes);
        const amm1 = amm1Type as AMM;

        const vault2A = resolveVault(pool2Vault1 as VaultTypes);
        const vault2B = resolveVault(pool2Vault2 as VaultTypes);
        const amm2 = amm2Type as AMM;

        let vault2Output = vault2A === vault1B ? vault2B : vault2A;

        let pool1 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault1A.getAsset(),
                await vault1B.getAsset(),
                amm1
            )
        )
        let pool2 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault2A.getAsset(),
                await vault2B.getAsset(),
                amm2
            )
        )

        let before1 = await pool1.getPoolData();

        let txs = await doSwap(admin,
            vault1A,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(await vault1A.getAsset(), await vault1B.getAsset(), amm1),
                0n,
                new SwapStepParams(
                    await factory.getPoolAddressHash(await vault2A.getAsset(), await vault2B.getAsset(), amm2),
                    0n,
                    null
                )
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        let after1 = await pool1.getPoolData();

        printTransactions(txs.transactions);
        expect(before1.reserve1).not.toBe(after1.reserve1);
        expect(before1.reserve2).not.toBe(after1.reserve2);

        expect(txs.transactions).toHaveTransaction(
            {
                from: vault1A.address,
                to: pool1.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool1.address,
                to: pool2.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool2.address,
                to: vault2Output.address,
                success: true,
                exitCode: 0
            }
        )

        expect(pool1.address.toRawString()).toBe(pool2.address.toRawString())

    });

    test.each(twoSwapFromAToB)
    ('do two swap, second swap failed (%i %i %i) -> (%i %i %i)', async (fromVault, toVault, amm1Type,
                                                                        pool2Vault1, pool2Vault2, amm2Type) => {

        const vault1A = resolveVault(fromVault as VaultTypes);
        const vault1B = resolveVault(toVault as VaultTypes);
        const amm1 = amm1Type as AMM;

        const vault2A = resolveVault(pool2Vault1 as VaultTypes);
        const vault2B = resolveVault(pool2Vault2 as VaultTypes);
        const amm2 = amm2Type as AMM;

        let vault2Output = vault2A === vault1B ? vault2B : vault2A;

        let pool1 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault1A.getAsset(),
                await vault1B.getAsset(),
                amm1
            )
        )
        let pool2 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault2A.getAsset(),
                await vault2B.getAsset(),
                amm2
            )
        )

        let before1 = await pool1.getPoolData();
        let before2 = await pool2.getPoolData();

        let txs = await doSwap(admin,
            vault1A,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(await vault1A.getAsset(), await vault1B.getAsset(), amm1),
                0n,
                new SwapStepParams(
                    await factory.getPoolAddressHash(await vault2A.getAsset(), await vault2B.getAsset(), amm2),
                    toNano(1000),
                    null
                )
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        let after1 = await pool1.getPoolData();
        let after2 = await pool2.getPoolData();

        printTransactions(txs.transactions);
        expect(before1.reserve1).not.toBe(after1.reserve1);
        expect(before1.reserve2).not.toBe(after1.reserve2);

        if (pool1.address.toRawString() !== pool2.address.toRawString()) {
            expect(before2.reserve1).toBe(after2.reserve1);
            expect(before2.reserve2).toBe(after2.reserve2);
        }

        expect(txs.transactions).toHaveTransaction(
            {
                from: vault1A.address,
                to: pool1.address,
                success: true,
                exitCode: 0
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool1.address,
                to: pool2.address,
                success: true,
                exitCode: 269
            }
        )
        expect(txs.transactions).toHaveTransaction(
            {
                from: pool2.address,
                to: vault1B.address,
                success: true,
                exitCode: 0
            }
        )
    });

    test.each(allPoolsAllDirections)
    ('do two swap, second swap failed, due to wrong dest (%i %i %i)', async (fromVault, toVault, amm1Type) => {

        const vault1A = resolveVault(fromVault as VaultTypes);
        const vault1B = resolveVault(toVault as VaultTypes);
        const amm1 = amm1Type as AMM;

        let pool1 = blockchain.openContract(
            await factory.getPoolJettonBased(
                await vault1A.getAsset(),
                await vault1B.getAsset(),
                amm1
            )
        )
        let before1 = await pool1.getPoolData();

        let someNonPoolAddress = BigInt('0x' + factory.address.hash.toString('hex'));

        let txs = await doSwap(admin,
            vault1A,
            toNano(1),
            new SwapStepParams(
                await factory.getPoolAddressHash(await vault1A.getAsset(), await vault1B.getAsset(), amm1),
                0n,
                new SwapStepParams(
                    someNonPoolAddress,
                    toNano(0),
                    null
                )
            ),
            new SwapParams(
                BigInt((1 << 30) * 2),
                admin.address,
                null,
                null
            )
        );
        let after1 = await pool1.getPoolData();

        printTransactions(txs.transactions);
        expect(before1.reserve1).not.toBe(after1.reserve1);
        expect(before1.reserve2).not.toBe(after1.reserve2);

        expect(txs.transactions).toHaveTransaction(
            {
                from: vault1A.address,
                to: pool1.address,
                success: true,
                exitCode: 0
            }
        )
        // address Pool<A, A> can't be constructed
        expect(txs.transactions).not.toHaveTransaction(
            {
                to: vault1B.address,
                op: 0xc0ffee21
            }
        )
        expect(txs.transactions).not.toHaveTransaction(
            {
                to: vault1A.address,
                op: 0xc0ffee21
            }
        )
    });
});
