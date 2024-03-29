import { useEffect, useMemo, useState } from "react";
import { dequeue, getChatLink } from "@/api";
import { history, useLocation, useModel } from "umi";
import {
  uploadFile,
  genCollectionDeployTx,
  genNFTMintTx,
  getChatMember,
} from "@/api";
import { useTonhubConnect } from "react-ton-x";
import { TxConfirmModal } from "@/pages/collectionCreate";
import { WalletName } from "@/models/app";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { formatAddress, getUrl } from "@/utils";
import {
  getBindResult,
  IBindResultData,
  saveTelegramMsgData,
} from "@/api/apis";
import { toNano, Address } from "ton";
import { message, Modal } from "antd";
import { request } from "umi";

export default (
  gid: number | string,
  uid: number | string
): { mintLoading: boolean } => {
  const { address, walletName } = useModel("app");
  const connect = useTonhubConnect();
  const [tonConnectUi] = useTonConnectUI();
  const [mintLoading, setMintLoading] = useState(false);
  const walletDisplay = useMemo(() => {
    if (walletName === WalletName.Tonkeeper) {
      return WalletName.Tonkeeper;
    } else {
      return process.env.APP_ENV === "prod" ? "Tonhub" : "Sandbox";
    }
  }, [walletName]);

  const sendToChat = async (detail: any, nftId: number) => {
    try {
      let caption =
        `#${nftId} ${detail.nft_name}\n` + `${detail.description}\n`;
      if (caption.length > 1000) {
        caption = caption.substring(0, 1000);
      }
      const chatMember = await getChatMember(detail.gid, detail.uid);

      if (chatMember) {
        caption += `\n@${chatMember}`;
      }
      const reply_markup = {
        inline_keyboard: [
          [
            {
              text: "👍",
              callback_data: "like",
            },
            {
              text: "👎",
              callback_data: "dislike",
            },
            // {
            //   text: "Follow",
            //   callback_data: "follow",
            // },
          ],
        ],
      };
      const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`;
      const data = {
        chat_id: detail.daoId,
        photo: detail.fileId,
        caption,
        reply_markup,
      };
      const res = await request(url, {
        method: "POST",
        data: data,
        errorHandler: () => {},
      });
      console.log("sendToChat: ", res);
      if (res.ok && res.result) {
        const saveRes = await saveTelegramMsgData({
          group_id: detail.daoId,
          message_id: res.result.message_id,
          type: "JSON",
          data: JSON.stringify(res.result),
        });
        console.log("saveRes: ", saveRes);
      }
    } catch (e) {
      console.log("sendToChat: ", e);
    }
  };

  const updateMintButtonMarkup = async (
    type: "success" | "fail",
    detail: any
  ) => {
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageReplyMarkup`;

    let reply_markup;
    if (type === "success") {
      const daoId = detail.daoId;
      const groupLink = await getChatLink(daoId);
      reply_markup = {
        inline_keyboard: [
          [
            {
              text: "View DAO",
              url: groupLink,
            },
          ],
        ],
      };
    } else {
      reply_markup = {
        inline_keyboard: [
          [
            {
              text: "Mint",
              callback_data: "mint_prompt",
            },
          ],
        ],
      };
    }
    const data = {
      chat_id: detail.gid,
      message_id: detail.message_id,
      reply_markup,
    };
    const res = await request(url, {
      method: "POST",
      data: data,
      errorHandler: () => {},
    });
  };

  const handleDequeue = async () => {
    let detail;
    try {
      const res = await dequeue(gid, uid);
      if (res && res.data && res.data.length > 0) {
        const data = res.data;
        detail = JSON.parse(data);
        const params = {
          owner: address,
          collection: {
            name: detail.collection_name,
            address: detail.collection_contract,
          },
          name: `${detail.nft_prefix}-${Date.now()}`,
          description: detail.prompt,
          image: detail.image,
          attributes: [],
        };
        detail.nft_name = params.name;
        detail.description = params.description;
        const tx = await genNFTMintTx(params);
        setMintLoading(false);
        TxConfirmModal(walletDisplay);
        if (walletName === WalletName.Tonhub) {
          const request = {
            //@ts-ignore
            seed: connect.state.seed, // Session Seed
            //@ts-ignore
            appPublicKey: connect.state.walletConfig.appPublicKey, // Wallet's app public key
            to: detail.collection_contract, // Destination
            value: toNano(tx.value).toString(), // Amount in nano-tons
            timeout: 5 * 60 * 1000, // 1 min timeout
            // stateInit: tx.state_init, // Optional serialized to base64 string state_init cell
            text: "Mint NFT", // Optional comment. If no payload specified - sends actual content, if payload is provided this text is used as UI-only hint
            payload: tx.payload, // Optional serialized to base64 string payload cell
          };

          const response = await connect.api.requestTransaction(request);

          console.log("tx resp: ", response);
          if (response.type === "rejected") {
            // Handle rejection
            message.warn("Transaction rejected.");
            throw new Error("Rejected");
          } else if (response.type === "expired") {
            // Handle expiration
            message.warn("Transaction expired. Please try again.");
            throw new Error("Expired");
          } else if (response.type === "invalid_session") {
            // Handle expired or invalid session
            message.warn(
              "Transaction or session expired. Please re-login and try again."
            );
            throw new Error("Invalid session");
          } else if (response.type === "success") {
            // Handle successful transaction
            message.success("Mint NFT successfully.");
            sendToChat(detail, tx.token_id);
            updateMintButtonMarkup("success", detail);
          } else {
            throw new Error("Impossible");
          }
        } else {
          const _tx = {
            validUntil: Date.now() + 5 * 60 * 1000,
            messages: [
              {
                address: detail.collection_contract,
                amount: toNano(tx.value).toString(),
                payload: tx.payload,
                text: "Mint NFT",
              },
            ],
          };
          //@ts-ignore
          const resp = await tonConnectUi.connector.sendTransaction(_tx);
          console.log("tonkeeper resp: ", resp);
          message.success("Mint NFT successfully.");

          sendToChat(detail, tx.token_id);
          updateMintButtonMarkup("success", detail);
        }
      }
      setMintLoading(false);
    } catch (e) {
      console.log(e);
      message.warning("Mint NFT failed.");
      if (detail) {
        updateMintButtonMarkup("fail", detail);
      }
    } finally {
      setMintLoading(false);
      Modal.destroyAll();
    }
  };

  useEffect(() => {
    if (address && gid && uid) {
      setMintLoading(true);
      handleDequeue();
    }
  }, [address, gid, uid]);

  return {
    mintLoading,
  };
};
