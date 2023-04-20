import dayjs from "dayjs";
import { message } from "antd";
import TonWeb from "tonweb";
import { Address, beginCell, toNano } from "ton";
import BN from "bn.js";
import { OPS } from "@/utils/jetton-minter.deploy";
export const formatTimestamp = (
  timestamp?: number | string,
  format: string = "MM/DD/YYYY"
) => {
  if (!timestamp) return "";
  return dayjs(timestamp).format(format);
};

export const sha3 = (str: string) => {};

export function fallbackCopyTextToClipboard(text: string, tip?: string) {
  var textArea = document.createElement("textarea");
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    var successful = document.execCommand("copy");
    var msg = successful ? "successful" : "unsuccessful";
    message.success(tip || "Copied!");
    console.log("Fallback: Copying text command was " + msg);
  } catch (err) {
    // message.error('Copy Failed');
    // message({ content: "Copy Failed" });
    console.error("Fallback: Oops, unable to copy", err);
  }

  document.body.removeChild(textArea);
}
export function toBuffer(ab) {
  var buf = new Buffer(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}
export const getUrl = (uri: string, config?: any): string => {
  if (!uri) return "";
  let source: string = uri;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }
  if (source.startsWith("ipfs://")) {
    source = source.substring(7);
  }
  source = `https://ipfs.io/ipfs/${source}`;
  return source;
};

export const formatAddress = (addr: string) => {
  return new TonWeb.Address(addr).toString(true, true, true);
};

export const getCountdownTime = (timeMilSecs: number) => {
  const now = new Date().getTime();
  const distance = timeMilSecs - now;

  const hours = Math.floor(distance / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  return [hours, minutes, seconds];
};

const { JettonMinter, JettonWallet } = TonWeb.token.jetton;
const tonweb = new TonWeb(
  new TonWeb.HttpProvider("https://testnet.toncenter.com/api/v2/jsonRPC", {
    apiKey: process.env.TON_CENTER_API_TOKEN,
  })
);
export const getJettonBalance = async (jettonAddr: string, owner: string) => {
  const minter = await new JettonMinter(tonweb.provider, {
    adminAddress: new TonWeb.Address(owner),
    jettonContentUri: "",
    jettonWalletCodeHex: "",
    address: jettonAddr,
  });
  const walletAddr = await minter.getJettonWalletAddress(
    new TonWeb.Address(owner)
  );
  const jettonWallet = new JettonWallet(tonweb.provider, {
    address: walletAddr,
  });
  const data = await jettonWallet.getData();
  console.log("getJettonBalance", data.balance.toNumber());
  return data.balance;
};

export const getJettonTransferTx = async (
  jettonAddr: string,
  from: string,
  to: string,
  amount: BN,
  forwardAmount: string
) => {
  const minter = await new JettonMinter(tonweb.provider, {
    adminAddress: new TonWeb.Address(from),
    jettonContentUri: "",
    jettonWalletCodeHex: "",
    address: jettonAddr,
  });
  const walletAddr = await minter.getJettonWalletAddress(
    new TonWeb.Address(from)
  );
  const jettonWallet = new JettonWallet(tonweb.provider, {
    address: walletAddr,
  });
  const body = await getJettonTransferBody(
    Address.parse(to),
    amount,
    toNano(forwardAmount)
  );
  const payload = toBuffer(await body.toBoc()).toString("base64");
  console.log(
    "jettonWallet address: ",
    jettonWallet.address!.toString(true, true, true)!
  );
  return {
    to: jettonWallet.address!.toString(true, true, true),
    value: 0.2 + +forwardAmount,
    payload: payload,
  };
};

export const getLaunchpadInfo = async (launchpadAddr: string) => {
  const tonweb = new TonWeb(
    new TonWeb.HttpProvider("https://testnet.toncenter.com/api/v2/jsonRPC", {
      apiKey: process.env.TON_CENTER_API_TOKEN,
    })
  );
  const launchpadData = await tonweb.provider.call2(
    launchpadAddr.toString(),
    "get_info"
  );

  const result = {
    releaseTime: launchpadData[0].toNumber(),
    exRate: launchpadData[1].toNumber(),
    sourceJetton:
      launchpadData[2].bits.length > 2
        ? launchpadData[2].beginParse().loadAddress().toString()
        : null,
    soldJetton: launchpadData[3].beginParse().loadAddress().toString(),
    cap: launchpadData[4].toNumber(),
    received: launchpadData[5].toNumber(),
    JETTON_WALLET_CODE: launchpadData[6],
    timeLockCode: launchpadData[7],
    owner: launchpadData[8].beginParse().loadAddress().toString(),
  };
  if (result.sourceJetton) {
    result.sourceJetton = Address.parse(result.sourceJetton).toFriendly();
  }
  if (result.soldJetton) {
    result.soldJetton = Address.parse(result.soldJetton).toFriendly();
  }
  if (result.owner) {
    result.owner = Address.parse(result.owner).toFriendly();
  }
  console.log("launchpadData: ", result);
  return result;
};
const getJettonTransferBody = (
  toOwnerAddress: Address,
  jettonValue: number | BN,
  forwardAmount?: number | BN
) => {
  return beginCell()
    .storeUint(OPS.Transfer, 32)
    .storeUint(0, 64) // queryid
    .storeCoins(jettonValue)
    .storeAddress(toOwnerAddress)
    .storeAddress(null) // TODO RESP?
    .storeDict(null) // custom payload
    .storeCoins(forwardAmount ?? 0) // forward ton amount
    .storeRefMaybe(null) // forward payload - TODO??
    .endCell();
};
