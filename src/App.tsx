import * as React from "react";
import styled from "styled-components";
import WalletConnect from "@walletconnect/browser";
import { IInternalEvent } from "@walletconnect/types";
import Button from "./components/Button";
import Column from "./components/Column";
import Wrapper from "./components/Wrapper";
import Modal from "./components/Modal";
import Header from "./components/Header";
import Loader from "./components/Loader";
import { fonts } from "./styles";
// import { ecrecover } from "./helpers/utilities";
import { IAssetData } from "./helpers/types";
import Banner from "./components/Banner";
import PaymentChannelsClient from "./core/PaymentChannelsClient";
import QR from "qr-image";

const SLayout = styled.div`
  position: relative;
  width: 100%;
  /* height: 100%; */
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

const SButtonContainer = styled(Column)`
  width: 250px;
  margin: 50px 0;
`;

const SConnectButton = styled(Button)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px 0;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SModalTitle = styled.div`
  margin: 1em 0;
  font-size: 20px;
  font-weight: 700;
`;

const SModalParagraph = styled.p`
  margin-top: 30px;
`;

const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

const STable = styled(SContainer)`
  flex-direction: column;
  text-align: left;
`;

const SRow = styled.div`
  width: 100%;
  display: flex;
  margin: 6px 0;
`;

const SKey = styled.div`
  width: 30%;
  font-weight: 700;
`;

const SValue = styled.div`
  width: 70%;
  font-family: monospace;
`;

const STestButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const STestButton = styled(Button)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px;
`;


const QRWrapper = styled.div`
  margin-top: 30px;
  width: 200px;
  height: 200px;
  overflow: hidden,
  justify-content: center;
  align-items: center;
`;

interface IAppState {
  walletConnector: WalletConnect | null;
  fetching: boolean;
  connected: boolean;
  chainId: number;
  showModal: boolean;
  pendingRequest: boolean;
  uri: string;
  accounts: string[];
  address: string;
  result: any | null;
  assets: IAssetData[];
  qrData: any | null;
}

const INITIAL_STATE: IAppState = {
  walletConnector: null,
  fetching: false,
  connected: false,
  chainId: 1,
  showModal: false,
  pendingRequest: false,
  uri: "",
  accounts: [],
  address: "",
  result: null,
  assets: [],
  qrData: null
};

class App extends React.Component<any, any> {
  public state: IAppState = {
    ...INITIAL_STATE
  };
  

  public init = async () => {
    // bridge url
    const bridge = "https://bridge.walletconnect.org";

    // create new walletConnector
    const walletConnector = new WalletConnect({ bridge });

    window.walletConnector = walletConnector;

    this.setState({ walletConnector }, () => {
      if(walletConnector.connected){
        this.subscribeToEvents();
      }
    });
    
  }

  public componentDidMount(){
    this.init();
    // window.location.href = 'wc://payment/0xb2d191b6FE03C5B8A1aB249cFe88C37553357A23?chainId=3&amount=1&detail=Almond%20milk%20cappucino';
  }

  public walletConnectInit = async () => {
    const { walletConnector } = this.state;
    // check if already connected
    if (walletConnector && !walletConnector.connected) {
      // create new session
      await walletConnector.createSession();

      // get uri for QR Code modal
      const uri = walletConnector.uri + '&autosign=true&redirect='+escape(window.location.href);
      location.href = uri;
      // console log the uri for development      
    }
    // subscribe to events
    await this.subscribeToEvents();
  };
  public subscribeToEvents = () => {
    const { walletConnector } = this.state;

    if (!walletConnector) {
      return;
    }

    walletConnector.on("session_update", async (error, payload) => {
      console.log('walletConnector.on("session_update")', error, payload); // tslint:disable-line

      if (error) {
        throw error;
      }

      const { chainId, accounts } = payload.params[0];
      this.onSessionUpdate(accounts, chainId);
    });

    walletConnector.on("connect", (error, payload) => {
      console.log('walletConnector.on("connect")', error, payload); // tslint:disable-line

      if (error) {
        throw error;
      }

      this.onConnect(payload);
    });

    walletConnector.on("disconnect", (error, payload) => {
      console.log('walletConnector.on("disconnect")',error, payload); // tslint:disable-line
      if (error) {
        throw error;
      }

      this.onDisconnect();
    });

    if (walletConnector.connected) {
      const { chainId, accounts } = walletConnector;
      const address = accounts[0];
      this.setState({
        connected: true,
        chainId,
        accounts,
        address
      });
      PaymentChannelsClient.init(address, (msg:any) => {
        console.log('SIGN MESSAGE CALLED!'); // tslint:disable-line
        return this.signMessage(msg);
      });
    }

    this.setState({ walletConnector });
  };

  public killSession = async () => {
    const { walletConnector } = this.state;
    if (walletConnector) {
      walletConnector.killSession();
    }
    this.resetApp();
  };

  public resetApp = async () => {
    await this.setState({ ...INITIAL_STATE });
  };

  public onConnect = async (payload: IInternalEvent) => {
    const { chainId, accounts } = payload.params[0];
    const address = accounts[0];
    await this.setState({
      connected: true,
      chainId,
      accounts,
      address
    });
  };

  public onDisconnect = async () => {
    this.resetApp();
  };

  public onSessionUpdate = async (accounts: string[], chainId: number) => {
    const address = accounts[0];
    await this.setState({ chainId, accounts, address });
  };

  
  public toggleModal = () => this.setState({ showModal: !this.state.showModal });


  public generatePayment = () => {
    const { address, chainId } = this.state;
    const amount = 1;
    const title = 'Coffe Shop';
    const detail = escape('Almond milk cappucino');
    const payment_url = `wc://payment/${address}?chainId=${chainId}&amount=${amount}&detail=${detail}&title=${title}`;
    const qrData = QR.imageSync(payment_url, { type: 'svg' });
    this.setState({qrData});
    PaymentChannelsClient.hub.on('state::payment', (payment_amount:any) =>{
      if(parseFloat(amount.toString()) === parseFloat(payment_amount.toString())){
        alert('YOU GOT PAID!');
      } else {
        alert('PAYMENT!' + payment_amount);
      }
    });
  }

  

  public signMessage = async (message: any) => {

    function byteArrayToHex(value:any) {
      const HexCharacters = '0123456789abcdef';
      const result = [];
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        result.push(HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f]);
      }
      return '0x' + result.join('');
    }

    const hexMessage = byteArrayToHex(message);

    const { walletConnector, address } = this.state;

    if (!walletConnector) {
      return;
    }

    // test message
    const msgParams = [
      address, 
      hexMessage, 
    ];

    try {
      // open modal
      // this.toggleModal();

      // toggle pending request indicator
      // this.setState({ pendingRequest: true });

      // send message
      // setTimeout(()=>{
      //   const uri = 'wc://sign/message?redirect='+escape(window.location.href);
      //   location.href = uri;
      // }, 10);
      // const result = await walletConnector.signMessage([...msgParams, true]);
      return await walletConnector.signMessage([...msgParams, true]);

      // verify signature
      // const signer = ecrecover(result, msgParams[1]);
      // const verified = signer.toLowerCase() === address.toLowerCase();

      // // format displayed result
      // const formattedResult = {
      //   method: "eth_sign",
      //   address,
      //   signer,
      //   verified,
      //   result
      // };

      // // display result
      // this.setState({
      //   walletConnector,
      //   pendingRequest: false,
      //   result: formattedResult || null
      // });
    } catch (error) {
      console.error(error); // tslint:disable-line
      this.setState({ walletConnector, pendingRequest: false, result: null });
    }
  };

  public render = () => {
    const {
      assets,
      address,
      connected,
      chainId,
      fetching,
      showModal,
      pendingRequest,
      result
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.killSession}
          />
          <SContent>
            {!address && !assets.length ? (
              <SLanding center>
                <h3>
                  POS
                </h3>
                <SButtonContainer>
                  <SConnectButton
                    left
                    onClick={this.walletConnectInit}
                    fetching={fetching}
                  >
                    {"SET UP"}
                  </SConnectButton>
                </SButtonContainer>
              </SLanding>
            ) : (
              <SBalances>
                <Banner />
                <Column center>
                  <STestButtonContainer>
                    {/* <STestButton left onClick={this.testSignMessage}>
                      {"Sign Test Message"}
                    </STestButton> */}

                    { !this.state.qrData && <STestButton
                      left
                      onClick={this.generatePayment}
                    >
                      {"CHECKOUT"}
                    </STestButton> }
                  </STestButtonContainer>
                </Column>
              </SBalances>
            )}
            <QRWrapper dangerouslySetInnerHTML={{ __html: this.state.qrData }} />
          </SContent>
        </Column>
        <Modal show={showModal} toggleModal={this.toggleModal}>
          {pendingRequest ? (
            <div>
              <SModalTitle>{"Pending Call Request"}</SModalTitle>
              <SContainer>
                <Loader />
                <SModalParagraph>
                  {"Approve or reject request using your wallet"}
                </SModalParagraph>
              </SContainer>
            </div>
          ) : result ? (
            <div>
              <SModalTitle>{"Call Request Approved"}</SModalTitle>
              <STable>
                {Object.keys(result).map(key => (
                  <SRow key={key}>
                    <SKey>{key}</SKey>
                    <SValue>{result[key].toString()}</SValue>
                  </SRow>
                ))}
              </STable>
            </div>
          ) : (
            <div>
              <SModalTitle>{"Call Request Rejected"}</SModalTitle>
            </div>
          )}
        </Modal>
      </SLayout>
    );
  };
}

export default App;
