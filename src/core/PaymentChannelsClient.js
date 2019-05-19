// eslint-disable-next-line import/no-namespace
import * as Connext from 'connext';
import EthQuery from 'ethjs-query';
// eslint-disable-next-line import/no-nodejs-modules
import { EventEmitter } from 'events';

// eslint-disable-next-line
const { Big } = Connext.big;
const { CurrencyType, CurrencyConvertable } = Connext.types;
const { getExchangeRates, hasPendingOps } = new Connext.Utils();
// Constants for channel max/min - this is also enforced on the hub
const DEPOSIT_ESTIMATED_GAS = Big('700000'); // 700k gas
const WEI_PER_ETHER = Big(1000000000000000000);
const HUB_EXCHANGE_CEILING = WEI_PER_ETHER.mul(Big(69)); // 69 TST
//const CHANNEL_DEPOSIT_MAX = WEI_PER_ETHER.mul(Big(30)); // 30 TST
const MAX_GAS_PRICE = Big('20000000000'); // 20 gWei
const MIN_DEPOSIT_ETH = 0.3;
const MAX_DEPOSIT_TOKEN = 30;
const hub = new EventEmitter();

class PaymentChannelClient {
	constructor(address, signingMessageFn) {
		this.selectedAddress = address;
		this.signingMessageFn = signingMessageFn.bind(this);
		this.state = {
			address: null,
            authorized: false,
			channelManagerAddress: null,
			channelState: null,
			connext: null,
			connextState: null,
			contractAddress: null,
			depositAmount: '',
			ethNetworkId: null,
			ethprovider: null,
			exchangeRate: 0,
			hubUrl: null,
			hubWalletAddress: null,
			loadingConnext: true,
			persistent: null,
			provider: null,
            ready: false,
			runtime: null,
			sendAmount: '',
			sendRecipient: '',
			status: {
				reset: false,
				txHash: '',
				type: ''
			},
		};
	}

	setState = data => {
		Object.keys(data).forEach(key => {
			this.state[key] = data[key];
		});
	};

	getExternalWallet() {
		
		return {
			address: this.selectedAddress,
			external: true,
			getAddress: () => Promise.resolve(this.selectedAddress),
			getBalance: block => 0,
			signMessage: message => this.signingMessageFn(message, this.selectedAddress)
		};
	}

	async setConnext() {
		const type = 'rinkeby';

		const publicUrl = 'https://daicard.io';
		let hubUrl;
		switch (type) {
			case 'rinkeby':
				hubUrl = `${publicUrl}/api/rinkeby/hub`;
				break;
			case 'mainnet':
				hubUrl = `${publicUrl}/api/mainnet/hub`;
				break;
			default:
				throw new Error(`Unrecognized network: ${type}`);
		}
		const opts = {
			externalWallet: this.getExternalWallet(),
			hubUrl,
			user: this.selectedAddress,
		};

		console.log('Setting up connext with opts:', opts); // tslint:disable-line

		// *** Instantiate the connext client ***
		try {
			const connext = await Connext.getConnextClient(opts);

			this.setState({
				address: this.selectedAddress,
				channelManagerAddress: connext.opts.contractAddress,
                connext,
                ethNetworkId: connext.opts.ethNetworkId,
				hubWalletAddress: connext.opts.hubAddress				
			});
			
			console.log(`Successfully set up connext! Connext config:`); // tslint:disable-line
			console.log(`  - hubAddress: ${connext.opts.hubAddress}`); // tslint:disable-line
			console.log(`  - contractAddress: ${connext.opts.contractAddress}`); // tslint:disable-line
			console.log(`  - ethNetworkId: ${connext.opts.ethNetworkId}`); // tslint:disable-line
			console.log(`  - public address: ${this.state.address}`); // tslint:disable-line

			
		} catch (e) {
			console.log('setConnext::error', e); // tslint:disable-line
		}
	}

	getBalance = () => {
		const amount = (this.state && this.state.channelState && this.state.channelState.balanceTokenUser) || '0';
		const ret = Big(amount).div(WEI_PER_ETHER);
		if (ret.toNumber() === 0) {
			return '0.00';
		}
		return ret.toNumber().toFixed(2).toString();
	};

	async pollConnextState() {
		const { connext } = this.state;
		// register connext listeners
		connext.on('onStateChange', state => {
			console.log('NEW STATE', state); // tslint:disable-line
			this.setState({
				channelState: state.persistent.channel,
				connextState: state,
				exchangeRate: state.runtime.exchangeRate ? state.runtime.exchangeRate.rates.USD : 0,
				ready: true,
				runtime: state.runtime,
			});
			this.checkStatus();
			console.log('EMITTING STATE UPDATE'); // tslint:disable-line
			hub.emit('state::change', {
				balance: this.getBalance(),
				ready: true,
				status: this.state.status
			});
			if(
				this.state.persistent &&
				this.state.persistent.channelUpdate && 
				this.state.persistent.channelUpdate.reason === "Payment" &&
				this.state.persistent.channelUpdate.args && 
				this.state.persistent.channelUpdate.args.recipient === "user" && 
				this.state.persistent.channelUpdate.args.amountToken !== "0"
			){
				const ret = Big(this.state.persistent.channelUpdate.args.amountToken).div(WEI_PER_ETHER);
				const amountToken = ret.toNumber().toFixed(2).toString()
				hub.once('state::payment', amountToken);
			}
		});
		// start polling
		await connext.start();
		this.setState({ loadingConnext: false });
	}

	async checkStatus() {
		const { runtime, status } = this.state;
		const newStatus = {
			reset: status.reset
		};

		if (runtime) {
			if (runtime.withdrawal.submitted) {
				if (!runtime.withdrawal.detected) {
					newStatus.type = 'WITHDRAWAL_PENDING';
				} else {
					newStatus.type = 'WITHDRAWAL_SUCCESS';
					newStatus.txHash = runtime.withdrawal.transactionHash;
				}
			}
		}

		if (newStatus.type !== status.type) {
			newStatus.reset = true;
			console.log(`New channel status! ${JSON.stringify(newStatus)}`); // tslint:disable-line
			console.log(`STATUS TYPE!`, newStatus.type); // tslint:disable-line
		}
		this.setState({ status: newStatus });
	}

	withdrawAll = async () => {
		try {
			const connext = this.state.connext;
			const withdrawalVal = {
				exchangeRate: this.state.runtime.exchangeRate.rates.USD,
				recipient: this.selectedAddress.toLowerCase(),
				tokensToSell: this.state.channelState.balanceTokenUser,
				weiToSell: '0',
				withdrawalTokenUser: '0',
				withdrawalWeiUser: this.state.channelState.balanceWeiUser,
			};

			await connext.withdraw(withdrawalVal);
			console.log('withdraw succesful'); // tslint:disable-line
		} catch (e) {
			console.log('withdraw error', e); // tslint:disable-line
		}
	};

}

let client = null;

const instance = {
	async init(address, signingMessageFn) {
		client = new PaymentChannelClient(address, signingMessageFn);
		await client.setConnext();
		await client.pollConnextState();
	},
	getInstance: () => this,
	getStatus: () => client.state && client.state.status,
	hub,
	withdrawAll: () => client.withdrawAll()
};


export default instance;
