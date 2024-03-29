import "./index.less";
import {
  RemoteConnectPersistance,
  TonhubConnectProvider,
  useTonhubConnect,
} from "react-ton-x";
import { Button } from "antd";
// TODO change to L3 client
export const tc = new TonClient({
  endpoint: "https://scalable-api.tonwhales.com/jsonRPC",
});
import useLocalStorage from "use-local-storage";
import isMobile from "is-mobile";
import QRCode from "react-qr-code";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TonClient } from "ton";

import { useEffect } from "react";
import { useModel } from "umi";
let wasPendingConnectionChecked = false;
export default () => {
  const queryClient = new QueryClient();
  const { address, setAddress } = useModel("app");
  const [connectionState, setConnectionState] =
    useLocalStorage<RemoteConnectPersistance>("connection", {
      type: "initing",
    });

  const connect: any = useTonhubConnect();
  const isConnected = connect.state.type === "online";
  console.log("1", connect.state.type);
  // fix for stale connections, can probably be improved
  useEffect(() => {
    window.Telegram.WebApp.ready();
    if (!wasPendingConnectionChecked && connectionState?.type === "pending") {
      localStorage.removeItem("connection");
      window.location.reload();
    }
    wasPendingConnectionChecked = true;
  }, [connectionState]);
  console.log("process.env.APP_URL: ", process.env.APP_URL);
  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <TonhubConnectProvider
          network={process.env.APP_ENV === "prod" ? "mainnet" : "sandbox"}
          url={process.env.APP_URL!}
          // url="https://ton.org"
          name="Soton TWA BOT"
          debug={false}
          connectionState={connectionState}
          setConnectionState={(s) => {
            setConnectionState(s as RemoteConnectPersistance);
          }}
        >
          <_TonConnecterInternal />
        </TonhubConnectProvider>
      </QueryClientProvider>
    </div>
  );
};

function _TonConnecterInternal(props: any) {
  const connect: any = useTonhubConnect();
  const { setAddress, address } = useModel("app");
  const isConnected = connect.state.type === "online";
  console.log(connect.state.type);
  useEffect(() => {
    const addr = connect.state?.walletConfig?.address;
    if (addr && addr !== address) {
      setAddress(connect.state?.walletConfig?.address);
    }
  }, [connect]);

  const handleLogout = () => {
    connect.api.revoke();
    setAddress("");
  };

  return (
    <>
      {!isConnected && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TonConnect />
        </div>
      )}
      {isConnected && (
        <div style={{ marginTop: "20px" }}>
          <Button className="default-btn logout-btn" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      )}
    </>
  );
}

function TonConnect() {
  const connect = useTonhubConnect();
  // console.log("link: ", connect.state.link);
  return (
    <div className="login-container">
      <h1 className="title">Welcome to Soton</h1>
      {connect.state.type === "initing" && (
        <span className="text-tip">Waiting for session</span>
      )}
      {connect.state.type === "pending" && (
        <div className="login-content">
          {isMobile() && (
            <Button
              className="primary-btn login-mobile-btn"
              onClick={() => {
                // @ts-ignore
                window.location.href = connect.state.link.replace(
                  process.env.APP_ENV === "prod" ? "ton://" : "ton-test://",
                  process.env.APP_ENV === "prod"
                    ? "https://tonhub.com/"
                    : "https://test.tonhub.com/"
                );
              }}
            >
              Open {process.env.APP_ENV === "prod" ? "Tonhub" : "Sandbox"}{" "}
              Wallet{" "}
            </Button>
          )}
          {!isMobile() && (
            <div className="login-pc">
              <div className="login-qrcode">
                <QRCode value={connect.state.link} />
              </div>
              <p className="text-tip">
                Scan with your mobile{" "}
                {process.env.APP_ENV === "prod" ? "Tonhub" : "Sandbox"} wallet:
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
