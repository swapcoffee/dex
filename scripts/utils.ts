import {NetworkProvider, sleep, UIProvider} from "@ton/blueprint";
import {Address, Cell, Dictionary} from "@ton/core";
import {TonClient, TonClient4} from "@ton/ton";
import {JettonMaster} from "../wrappers/Jetton";
import {compileMany} from "../tests/utils";

export const NATIVE_ADDRESS = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

export async function getSeqNo(provider: NetworkProvider, address: Address) {
    if (await provider.isContractDeployed(address)) {
        let api = provider.api() as TonClient;
        let res = await api.runMethod(address, 'seqno');
        return res.stack.readNumber();
    } else {
        return 0;
    }
}

export async function waitSeqNoChange(provider: NetworkProvider, address: Address, fn: () => Promise<void>) {
    console.log(` - Waiting up to 60 seconds to confirm transaction`);
    let successFlag = 0;
    let initSeqNo= await getSeqNo(provider, address);
    await fn();
    for (let attempt = 0; attempt < 60; attempt++) {
        await sleep(1000);
        const seqnoAfter = await getSeqNo(provider, address);
        if (seqnoAfter > initSeqNo) {
            successFlag = 1;
            break;
        }
    }
    if (successFlag) {
        console.log(` - Sent transaction done successfully`);
        return true;
    } else {
        console.log(` - Sent transaction didn't go through`);
        return false;
    }
}

export function printJettonData(jettons: Dictionary<bigint, Cell>) {
    console.log("Supported tokens for staking:")
    for (let [key, value] of jettons) {
        let ds = value.beginParse();
        let vaultJettonWalletAddress = ds.loadAddress();
        let normalizer = ds.loadCoins();
        console.log("hash:", key, "vaultJettonWalletAddress:", vaultJettonWalletAddress, "normalizer:", normalizer)
    }
}

export function printPeriods(periods: Dictionary<number, Cell>) {
    console.log("Supported periods for lock:")
    for (let [key, value] of periods) {
        let ds = value.beginParse();
        let duration = ds.loadUint(64);
        let percentage = ds.loadUint(64);
        console.log("periodId:", key, "duration(seconds):", duration, "extra rewards %:", percentage)
    }
}

export function printRewardsDistributions(distributions: Dictionary<bigint, Cell>) {
    console.log("Rewards:")
    for (let [key, value] of distributions) {
        let ds = value.beginParse();
        let duration = ds.loadUint(64);
        let finishAtUnix = ds.loadUint(64);
        let rewardRatePerSecond = ds.loadCoins()
        console.log("reward token hash:", key, "duration(seconds):", duration, "finish at:", finishAtUnix, new Date(finishAtUnix * 1_000),
            "rewardRatePerSecond:", rewardRatePerSecond)
    }
}

export async function parseInteger(ui: UIProvider, text: string) {
    while (true) {
        try {
            return Number.parseInt(await ui.input(text))
        } catch (Error) {
            console.log("Wrong number, try again")
        }
    }
}

export async function parseAsset(ui: UIProvider, text: string) {
    console.log("=======================")
    console.log("Enter 'native' for native vault");
    console.log("Enter number for external currency vault");
    console.log("Enter jetton master address for toke vault");
    while (true) {
        let data = await ui.input(text);
        if (data.toUpperCase() === 'NATIVE') {
            return null;
        }
        try {
            return BigInt(Number.parseInt(data));
        } catch (Error) {
            try {
                return Address.parse(data);
            } catch (Error) {}
        }
    }
}

export async function getAddress(contractAddress: Address, provider: NetworkProvider, returnMaster=false) {
    const ui = provider.ui();
    while (true) {
        try {
            let address = await ui.inputAddress("Enter jetton master address:")
            console.log(address)
            if(address.toRaw().toString() === NATIVE_ADDRESS.toRaw().toString()) {
                return address
            }
            let master = provider.open(JettonMaster.createFromAddress(address))
            if(returnMaster) {
                return [await master.getWalletAddress(contractAddress), contractAddress]
            }
            return await master.getWalletAddress(contractAddress)
        } catch (Error) {
            console.log("Wrong address, try again")
        }
    }
}
