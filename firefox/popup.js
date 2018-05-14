// Run main on document ready
var DEBUG = true;

const Panels = { login:'login', balances:'balances', history:'history', payment:'payment', offers:'offers', trustline:'trustline', inflation:'inflation', transaction:'transaction', options:'options', warning:'warning' };
const Ops = { pay: 'pay', payment: 'payment', offer: 'manageOffer', trustline: 'changeTrust', inflation: 'setOptions', tx: 'tx' };

var currentPanel   = Panels.login;
var lastPanel      = null;
var currentLink    = null;
var inExtension    = true;
var myAccount      = { publicKey:null, secretKey:null };
var balancesLoaded = false;
var historyLoaded  = false;
var assetsLoaded   = false;
var network        = 'live'; // test

if(network=='live'){
    StellarSdk.Network.usePublicNetwork();
	var serverUrl = 'https://horizon.stellar.org';
} else {
    StellarSdk.Network.useTestNetwork();
	var serverUrl = 'https://horizon-testnet.stellar.org';
}

// Message listener
if(chrome.runtime.onMessage) {
	chrome.runtime.onMessage.addListener(function (msg, sender) {
	    //console.log('Message received in popup', msg);
	    if ((msg.from === 'background') && (msg.subject === 'schema')) {
	        //console.log('SCHEMA FROM BACKGROUND', msg.data);
	    }
	    if ((msg.from === 'background') && (msg.subject === 'account-loaded')) {
	        onAccountLoaded(msg.data);
	    }
	    if ((msg.from === 'background') && (msg.subject === 'account-saved')) {
	        onAccountSaved(msg.data);
	    }
	    if ((msg.from === 'background') && (msg.subject === 'account-cleared')) {
	        onAccountCleared(msg.data);
	    }
	    if ((msg.from === 'content') && (msg.subject === 'schema')) {
	        //console.log('SCHEMA FROM CONTENT', msg.data);
	    }
	});
}

function sendMessage(subject, data, callback) {
	if(callback){
		chrome.runtime.sendMessage({ from: 'popup', subject: subject, data: data }, callback);
	} else {
		chrome.runtime.sendMessage({ from: 'popup', subject: subject, data: data });
	}
}

window.addEventListener('DOMContentLoaded', main);


//---- MAIN ----------------------------------------

function main() {
	inExtension = chrome.runtime.getManifest ? true : false;

	if(inExtension){
		DEBUG = !('update_url' in chrome.runtime.getManifest());
		//console.log('Manifest',  chrome.runtime.getManifest());
		//console.log('Extension', chrome.management.ExtensionType);
		//console.log('Install',   chrome.management.ExtensionInstallType);
	}

	//console.log('Popup main');
	//hidePanels();
	setTheme();
	eventHandlers();
	checkLastLink();
	isLogged(ok=>{
		if(!ok){
			//console.log('Not logged');
			showPanelLogin();
		} else {
			//console.log('Yes logged');
			loadAccount();
		}
	});
}

function $(id)   { return document.getElementById(id); }
function $$(q)   { return document.querySelector(q); }
function $$$(id) { return document.querySelector('#panel-'+currentPanel+' #'+id); }
function epoch() { return (new Date()).getTime(); }


function goBack(){ 
	if(!lastPanel){ return; }
	showPanel(lastPanel, true);
	lastPanel = null;
}

function showPanel(panel, back=false){ 
	clearToast();
	hideLoader();
	hidePanels();
	$('panel-'+panel).style.display = 'block';
	if(!back){ lastPanel = currentPanel; }
	currentPanel = panel;
}

function hidePanels(){
	var panels = document.querySelectorAll('section');
	//console.log('Panels',panels.length);
	for (var i = 0; i < panels.length; i++) {
		panels[i].style.display = 'none';
	}
}

function showLoader() {
	$('loader').style.display = 'block';
}

function hideLoader() {
	$('loader').style.display = 'none';
}

function toast(text, warn=false, secs=5) {
	var toaster = $('toast')
	toaster.innerHTML = text;
	toaster.style.display = 'block';
	toaster.addEventListener('click', clearToast, false);
	toaster.style.backgroundColor = (warn?'#800':'#369');
	setTimeout(clearToast, secs*1000);
}

function clearToast() {
	var toaster = $('toast')
	toaster.removeEventListener('click', clearToast, false);
	toaster.style.display = 'none';
}

//---- LOGIN ----------------------------------------

function showPanelLogin() {
	showPanel(Panels.login);
	$$$('secret').focus();
}

function isLogged(callback) {
	//console.log('Checking if logged...');
	if(inExtension){
		// token is account hash, if available then is logged else is not
		chrome.storage.local.get('token', function(data) {
			//console.log('token', data);
			var ok = (data.token ? true : false);
			callback(ok);
		});
	} else {
		//console.log('ISLOGGED: Not in extension');
		callback(false);
	}
}

function login() {
	var secret = $('secret').value;
	if(!secret || secret.trim()==''){
		showStatusLogin('Secret key is required to use Mooney');
		return;
	}
	if(secret.length!=56 || secret[0]!='S' || secret.toUpperCase()!=secret) {
		showStatusLogin('Secret key is invalid');
		return;
	}
	saveAccount(secret);
}

function logout() {
	sendMessage('logout');
	showPanelLogin();
}

function saveAccount(secret){
	myAccount.secretKey = secret;
	if(inExtension){ 
		chrome.runtime.sendMessage({ from: 'popup', subject: 'save-account', data: secret });
	} else {
		showStatusLogin('Must login in extension popup');
	}
}

function onAccountSaved(ok) {
	if(ok){
		loadAccount();
	} else {
		showStatusLogin('Error authenticating');
	}
}

function loadAccount() {
	if(inExtension){ 
		chrome.runtime.sendMessage({ from: 'popup', subject: 'load-account' });
	} else {
		showStatusLogin('Must login in extension popup');
		callback(false);
	}
}

function onAccountLoaded(account) {
	//console.log('Account loaded', account);
	if(account){
		myAccount = account;
		var keyPair = StellarSdk.Keypair.fromSecret(myAccount.secretKey)
		myAccount.publicKey = keyPair.publicKey();
		//console.log('My account', myAccount);
		if(currentLink){
			//console.log('Current link', currentLink);
			var schema = parseSchema(currentLink);
			//console.log('Current schema', schema);
			switch(schema.operation){
				case Ops.tx:        showPanelTransaction(); break;
				case Ops.pay:       showPanelPayment();     break;
				case Ops.payment:   showPanelPayment();     break;
				case Ops.offer:     showPanelOffers();      break;
				case Ops.trustline: showPanelTrustline();   break;
				case Ops.inflation: showPanelInflation();   break;
				default:            showPanelWarning();     break;
			}
		} else {
			showPanelBalances();
		}
	} else {
		showPanelLogin();
	}
}

function onAccountCleared(ok) {
	//console.log('Account cleared', ok);
	if(ok){
		showPanelLogin();
	}
}

function clearStatus() {
	$$$('status').innerHTML = '&nbsp;';
	//$$$('status').style.backgroundColor = 'transparent';
}

function showStatus(text) {
	$$$('status').innerHTML = text;
	//$$$('status').style.backgroundColor = '#88000044';
}

function showStatusLogin(text) {
	$$('#panel-login status').innerHTML = text;
	$$('#panel-login status').style.backgroundColor = '#88000044';
}


//---- BALANCES ----------------------------------------

function showPanelBalances() {
	showPanel(Panels.balances);
	if(!balancesLoaded) { loadBalances(); }
}

function loadBalances() {
	//console.log('Loading balances...');
	showLoader();
    var server = new StellarSdk.Server(serverUrl);
    server.loadAccount(myAccount.publicKey).then(function(account) {
        //console.log('Info for '+myAccount.publicKey, account);
        var bals = [];
        account.balances.forEach(function(balance) {
            if(balance.asset_type=='native'){
                bals.push({asset: 'XLM', issuer: 'native', name: 'Stellar Lumens', balance: balance.balance});
            } else {
                bals.push({asset: balance.asset_code, issuer: balance.asset_issuer, name: balance.asset_issuer.substr(0,10), balance: balance.balance});
            }
        });
        balancesLoaded = true;
        hideLoader();
        showBalances(bals);
    }).catch(function(error){
        hideLoader();
        //console.error('ERROR:', error);
        toast('Error loading balances', true);
    });
}

function showBalances(assets) {
    var table = $$('#panel-balances #assets');
    var row = '<tr id="{id}" issuer="{issuer}"><td>{sym}</td><td>{name}</td><td>{bal}</td></tr>';
    var html = '';
    table.tBodies[0].innerHTML = '';
    //console.log(assets);

    for (var i = 0; i < assets.length; i++) {
    	var item = assets[i];
        html += row.replace('{id}'    , item.asset)
                   .replace('{issuer}', item.issuer)
                   .replace('{sym}'   , item.asset)
	               .replace('{name}'  , item.name)
	               .replace('{bal}'   , money(item.balance, 2, true));
    }

	table.tBodies[0].innerHTML += html;
}


//---- PAYMENTS ----------------------------------------

function showPanelPayment() {
	//console.log('Panel payment');
	showPanel(Panels.payment);
	if(currentLink){
		var schema = parseSchema(currentLink);
		//console.log('Schema',schema);
		var source = myAccount.publicKey.substr(0,10);
		$$('#panel-payment #source').innerHTML = source || '';
		$$('#panel-payment #address').value    = schema.parameters['destination'] || '';
		$$('#panel-payment #amount').value     = schema.parameters['amount'] || '';
		$$('#panel-payment #notes').value      = schema.parameters['memo'] || '';
		$$('#panel-payment #issuer').value     = schema.parameters['issuer'] || '';
		$$('#panel-payment #asset').value      = schema.parameters['asset_code'] || 'XLM';
	}
	if(!assetsLoaded){ loadAssets(); }
}

function loadAssets() {
	//console.log('Loading assets...');
	showLoader();
    var server = new StellarSdk.Server(serverUrl);
    server.loadAccount(myAccount.publicKey).then(function(account) {
        //console.log('Info for '+myAccount.publicKey, account);
        var bals = [];
        account.balances.forEach(function(balance) {
            if(balance.asset_type=='native'){
                bals.push({asset: 'XLM', issuer: 'native', name: 'Stellar Lumens', balance: balance.balance});
            } else {
                bals.push({asset: balance.asset_code, issuer: balance.asset_issuer, name: balance.asset_issuer.substr(0,10), balance: balance.balance});
            }
        });
        assetsLoaded = true;
        hideLoader();
        showAssets(bals);
    }).catch(function(error){
        hideLoader();
        //console.error('ERROR:', error);
        toast('Error loading assets', true);
    });
}

function showAssets(assets) {
    var table = $$$('assets');
    var row = '<tr id="{id}" issuer="{issuer}"><td>{sym}</td><td>{name}</td><td>{bal}</td></tr>';
    var html = '';
    table.tBodies[0].innerHTML = '';
    //console.log(assets);

    for (var i = 0; i < assets.length; i++) {
    	var item = assets[i];
        html += row.replace('{id}'    , item.asset)
                   .replace('{issuer}', item.issuer)
                   .replace('{sym}'   , item.asset)
	               .replace('{name}'  , item.name)
	               .replace('{bal}'   , money(item.balance, 2, true));
    }

	table.tBodies[0].innerHTML += html;
	table.removeEventListener('click', function(event){ onAsset(event); } ,false);
	table.addEventListener('click', function(event){ onAsset(event); } ,false);
}

function onAsset() {
    var row    = event.target.parentNode;
    var symbol = row.id;
    var issuer = row.getAttribute("issuer");
    //if(!issuer) { return; }
    $$$('asset').value  = symbol;
    $$$('issuer').value = issuer;
    //console.log('Asset: ', symbol, issuer, event.target);
}

function onPayment() {
    var src    = $('source').value;
    var adr    = $('address').value;
    var amt    = $('amount').value;
    var sym    = $('asset').value;
    var issuer = $('issuer').value;
    var note   = $('notes').value;
    var from   = myAccount;
    var to     = { publicKey: adr };
    var asset  = StellarSdk.Asset.native();
    if(sym && sym!='XLM' && issuer) { asset = new StellarSdk.Asset(sym, issuer); }

    //console.log(adr, amt, note, asset);
    sendMoney(from, to, amt, note, asset);
}

// Sends payment or fund account if doesn't exist
function sendMoney(from, to, amount, note, asset) {
    var server    = new StellarSdk.Server(serverUrl);
    var mainAct   = StellarSdk.Keypair.fromSecret(from.secretKey);
    //  sourceKey = from.publicKey;
    var targetKey = to.publicKey;
    var funding   = false;

    disableMainButton();
    showStatus('Loading account...');
    
    // Make sure that the destination account exists
    // If it doesn't exist we will try to fund it else error out
    server.loadAccount(targetKey).catch(StellarSdk.NotFoundError, function (error) {
        showStatus('Account not found!');
        funding = true;  // If the account is not found, fund it
        return;
    }).then(function(){ 
        //console.log(funding?'FUND':'SEND'); 
        if(funding){
            showStatus('Funding operation...');
            var operation = StellarSdk.Operation.createAccount({
                destination: targetKey,
                startingBalance: ''+amount
            });
        } else {
            showStatus('Payment operation...');
            var operation = StellarSdk.Operation.payment({
                    destination : targetKey,
                    asset       : asset,
                    amount      : ''+amount
            });
            //console.log('OP: ',operation);
        }

        showStatus('Loading account...');
        server.loadAccount(mainAct.publicKey()).then(function(sourceAccount) {
            showStatus('Preparing transaction...');
            var builder = new StellarSdk.TransactionBuilder(sourceAccount);
            builder.addOperation(operation);
            if(note) { builder.addMemo(StellarSdk.Memo.text(note)) }
            var env = builder.build();
            showStatus('Signing transaction...');
            env.sign(mainAct);
            showStatus('Sending money...');
            return server.submitTransaction(env);
        }).then(function(result) {
            showStatus('OK - ' + (funding?'Account funded':'Payment sent'));
            enableMainButton();
            //console.log('Success!', result);
            // Update balance
            server.loadAccount(mainAct.publicKey()).then(function(account) {
                //console.log('Balance for '+mainAct.publicKey(), account);
                var bals = [];
                account.balances.forEach(function(balance) {
		            if(balance.asset_type=='native'){
		                bals.push({asset: 'XLM', issuer: 'native', name: 'Stellar Lumens', balance: balance.balance});
		            } else {
		                bals.push({asset: balance.asset_code, issuer: balance.asset_issuer, name: balance.asset_issuer.substr(0,10), balance: balance.balance});
		            }
		        });
		        assetsLoaded = true;
		        hideLoader();
		        showAssets(bals);
            });
        }).catch(function(error){
            showStatus('ERROR: Something went wrong!1');
            //console.error('ERROR1:', error);
            enableMainButton();
        });
    }).catch(function(error) {
        showStatus('ERROR: Something went wrong!2');
        //console.error('ERROR2:', error);
        enableMainButton();
    });
}

function disableMainButton(text='WAIT') {
  $$$('button-main').setAttribute('disabled','disabled');
  //$$$('button-main').innerHTML = text;
}

function enableMainButton(text='DONE') {
  $$$('button-main').removeAttribute('disabled');
  //$$$('button-main').innerHTML = text;
}



//---- HISTORY ----------------------------------------

function showPanelHistory() {
	showPanel(Panels.history);
	if(!historyLoaded){ loadHistory(); }
}

function loadHistory() {
	//console.log('Loading history...');
	showLoader()
    var server = new StellarSdk.Server(serverUrl);
	server.payments().forAccount(myAccount.publicKey).order('desc').limit(30).call().then(info=>{
		//console.log('Payments',info);
		historyLoaded = true;
		hideLoader();
		showHistory(info.records);
	}).catch(e=>{
		hideLoader();
		//console.log('Error', e);
        toast('Error loading history', true);
	});
}

function showHistory(list) {
    var table = $$$('ledger');
    var row = '<tr><td>{date}</td><td>{desc}</td><td class="{color}">{amount}</td><td>{asset}</td></tr>';
    var html = '';
    table.tBodies[0].innerHTML = '';
    //console.log(list);

    for (var i = 0; i < list.length; i++) {
    	var item = list[i];
	   	var date = dateShort(item.created_at);
    	if(item.type_i==0){
    		// New account
			var desc   = item.funder.substr(0,10);
			var amount = money(item.starting_balance);
			var color  = 'funded';
			var asset  = 'XLM';
    	} else {
    		// Payment
			var desc   = (item.from == myAccount.publicKey ? item.to : item.from).substr(0,10);
			var amount = money(item.amount);
			var color  = (item.from == myAccount.publicKey ? 'debit' : 'credit');
			var asset  = (item.asset_code || 'XLM');
    	}

        html += row.replace('{date}',   date)
                   .replace('{desc}',   desc)
	               .replace('{amount}', amount)
                   .replace('{color}',  color)
	               .replace('{asset}',  asset);
    }

    if(html==''){ html = '<tr><td colspan="4">No records</td></tr>'; }
	table.tBodies[0].innerHTML += html;
}



//---- OFFERS ----------------------------------------

function showPanelOffers() {
	showPanel(Panels.offers);
	if(currentLink){
		var schema = parseSchema(currentLink);
		//console.log('Schema', schema);
		if(schema.operation=='manageOffer'){
			var buyCode    = schema.parameters['buying_asset_code'] || 'XLM';
			var buyIssuer  = schema.parameters['buying_asset_issuer']  ? schema.parameters['buying_asset_issuer']  : 'NATIVE';
			var sellCode   = schema.parameters['selling_asset_code'] || 'XLM';
			var sellIssuer = schema.parameters['selling_asset_issuer'] ? schema.parameters['selling_asset_issuer'] : 'NATIVE';
			var sellPrice  = 0.0;
			var buyPrice   = 0.0;
			var sellAmount = schema.parameters['amount'] || 0.0;
			var buyAmount  = sellAmount*sellPrice;

			if(schema.parameters['price_n'] && schema.parameters['price_d']){
				var buyPrice   = schema.parameters['price_d'] / schema.parameters['price_n'];
				var sellPrice  = schema.parameters['price_n'] / schema.parameters['price_d'];
			} else if(schema.parameters['price']){
				var buyPrice   = parseFloat(1/schema.parameters['price']).toFixed(7);
				var sellPrice  = schema.parameters['price'];
			}

			$$('#panel-offers #buy-code').value    = buyCode;
			$$('#panel-offers #buy-issuer').value  = buyIssuer;
			$$('#panel-offers #buy-price').value   = buyPrice.toFixed(7);
			$$('#panel-offers #buy-amount').value  = buyAmount;

			$$('#panel-offers #sell-code').value   = sellCode;
			$$('#panel-offers #sell-issuer').value = sellIssuer;
			$$('#panel-offers #sell-price').value  = sellPrice.toFixed(7);
			$$('#panel-offers #sell-amount').value = sellAmount;
		}
	}
}

function updateOfferForm(event) {
	var field = event.target;
	var type  = field.id.split('-')[0];
	//console.log(field.id, type);
	var buyAmount  = $$('#panel-offers #buy-amount').value;   // 500 XLM
	var buyPrice   = $$('#panel-offers #buy-price').value;    // 2
	var sellAmount = $$('#panel-offers #sell-amount').value;  // 1000 GALT
	var sellPrice  = $$('#panel-offers #sell-price').value;   // 0.5
	var decsAmt = 2;
	var decsPrc = 2;

	if(type=='buy'){
		sellAmount = buyAmount * buyPrice;
		sellPrice  = buyPrice>0 ? 1/buyPrice : 0;
		decsAmt = parseInt(sellAmount)==sellAmount ? 0 : 7;
		decsPrc = parseInt(sellPrice)==sellPrice ? 0 : 7;
		$('sell-amount').value = sellAmount.toFixed(decsAmt);
		$('sell-price').value  = sellPrice.toFixed(decsPrc);;
	} else {
		buyAmount = sellAmount * sellPrice;
		buyPrice  = sellPrice>0 ? 1/sellPrice : 0;
		decsAmt = parseInt(buyAmount)==buyAmount ? 0 : 7;
		decsPrc = parseInt(buyPrice)==buyPrice ? 0 : 7;
		$('buy-amount').value = buyAmount.toFixed(decsAmt);
		$('buy-price').value  = buyPrice.toFixed(decsPrc);
	}
}

function onOffer() {
	var baseCode   = $('buy-code').value;
	var baseIssuer = $('buy-issuer').value;
	var baseAsset  = makeAsset(baseCode, baseIssuer);
	var cntrCode   = $('sell-code').value;
	var cntrIssuer = $('sell-issuer').value;
	var cntrAsset  = makeAsset(cntrCode, cntrIssuer);
	var amount     = $('sell-amount').value;
	var sellPrice  = $('sell-price').value;
    var fractal    = StellarSdk.Operation._toXDRPrice(parseFloat(sellPrice).toFixed(7))._attributes;
    var price      = {n: fractal.n, d: fractal.d};

    var offer = {
        buying  : baseAsset,
        selling : cntrAsset,
        amount  : amount,
        price   : price
    };
    //console.log(offer);

    var operation = StellarSdk.Operation.manageOffer(offer);
    submitOperation(myAccount, operation, 'Offer', ok=>{
    	if(ok){ toast('Offer operation successful'); }
    	else  { toast('Error creating offer. Try later', true); }
    });
}

function makeAsset(code, issuer) {
	if(!issuer || issuer=='NATIVE') {
		var asset  = StellarSdk.Asset.native();
	} else {
		var asset  = new StellarSdk.Asset(code, issuer);
	}
	return asset;
}


//---- INFLATION ----------------------------------------

function showPanelInflation() {
	showPanel(Panels.inflation);
	if(currentLink){
		var schema = parseSchema(currentLink);
		//console.log('Schema', schema);
		if(schema.operation=='setOptions' && schema.parameters['inflationDest']){
			$$('#panel-inflation #inflation-destin').value = schema.parameters['inflationDest'] || '';
		}
	}
}

function onInflation() {
	var destin = $('inflation-destin').value;
	if(!destin || destin.trim()==''){ return; }
    var operation = StellarSdk.Operation.setOptions({inflationDest: destin});
    submitOperation(myAccount, operation, 'Inflation', ok=>{
    	if(ok){ toast('Inflation destination set'); }
    	else  { toast('Error setting inflation. Try later', true); }
    });
}


//---- TRUSTLINE ----------------------------------------

function showPanelTrustline() {
	showPanel(Panels.trustline);
	if(currentLink){
		var schema = parseSchema(currentLink);
		//console.log('Schema', schema);
		if(schema.operation=='changeTrust'){
			$('trustline-issuer').value = schema.parameters['asset_issuer'] || '';
			$('trustline-code').value   = schema.parameters['asset_code'] || '';
			$('trustline-limit').value  = schema.parameters['limit'] || '';
		}
	}
}

function onTrustline() {
	var code   = $('trustline-code').value;
	var issuer = $('trustline-issuer').value;
	var limit  = $('trustline-limit').value;
	var asset  = new StellarSdk.Asset(code, issuer);

	if(limit){ 
		var operation = StellarSdk.Operation.changeTrust({asset: asset, limit: limit});
	} else {
		var operation = StellarSdk.Operation.changeTrust({asset: asset});
	}

    submitOperation(myAccount, operation, 'Trustline', ok=>{
    	if(ok){ toast('Trustline set for '+code); }
    	else  { toast('Error setting trustline. Try later', true); }
    });
}


//---- OPTIONS ----------------------------------------

function showPanelOptions() {
	showPanel(Panels.options);
	// Run something
}

function setTheme() {
	chrome.storage.local.get('theme', function(data) {
		if(data.theme=='lite'){ document.body.setAttribute('class', data.theme); }
		$('theme-name').innerHTML = data.theme=='lite'?'dark':'lite';
		//console.log('Theme', data.theme);
	});
}

function toggleTheme() {
	var theme = document.body.getAttribute('class');
	var newTheme = (theme=='lite'?'dark':'lite');
	document.body.setAttribute('class', newTheme);
	$('theme-name').innerHTML = theme;
    chrome.storage.local.set({theme: newTheme});
}


//---- SUBMIT ----------------------------------------

// Used for inflation, trustline, manageOffer
function submitOperation(source, operation, memo, callback) {
    var server  = new StellarSdk.Server(serverUrl);
    var mainAct = StellarSdk.Keypair.fromSecret(source.secretKey);

    disableMainButton();
    //showStatus('Loading account...');
    
    server.loadAccount(mainAct.publicKey()).then(function(sourceAccount) {
        //showStatus('Preparing transaction...');
        var builder = new StellarSdk.TransactionBuilder(sourceAccount);
        builder.addOperation(operation);
        if(memo) { builder.addMemo(StellarSdk.Memo.text(memo)) }
        var env = builder.build();
        //showStatus('Signing transaction...');
        env.sign(mainAct);
        //showStatus('Submitting operation...');
        return server.submitTransaction(env);
    }).then(function(result) {
        //console.log('Success!', result);
        //showStatus('Success!');
        enableMainButton();
        if(callback){ callback(true); }
    }).catch(function(error){
        //console.error('ERROR:', error);
        //showStatus('ERROR: Something went wrong!');
        enableMainButton();
        if(callback){ callback(false); }
    });
}

//---- EVENTS ----------------------------------------

function eventHandlers(){
	// Actions
	$$('#panel-login     #button-login').addEventListener('click',  login, false);
	$$('#panel-options   #button-logout').addEventListener('click', logout, false);
	$$('#panel-balances  #icon-options').addEventListener('click',  showPanelOptions, false);
	$$('#panel-balances  #icon-refresh').addEventListener('click',  loadBalances, false);
	$$('#panel-balances  #button-ledger').addEventListener('click', showPanelHistory, false);
	$$('#panel-balances  #button-gopay').addEventListener('click',  showPanelPayment, false);
	$$('#panel-history   #icon-refresh').addEventListener('click',  loadHistory, false);
	$$('#panel-payment   #icon-refresh').addEventListener('click',  loadAssets, false);
	$$('#panel-payment   #button-main').addEventListener('click',   onPayment, false);
	$$('#panel-inflation #button-main').addEventListener('click',   onInflation, false);
	$$('#panel-trustline #button-main').addEventListener('click',   onTrustline, false);
	$$('#panel-offers    #button-main').addEventListener('click',   onOffer, false);
	// Options
	$$('#panel-balances  #icon-options').addEventListener('click', showPanelOptions, false);
	$$('#panel-history   #icon-options').addEventListener('click', showPanelOptions, false);
	$$('#panel-payment   #icon-options').addEventListener('click', showPanelOptions, false);
	$$('#panel-offers    #icon-options').addEventListener('click', showPanelOptions, false);
	$$('#panel-trustline #icon-options').addEventListener('click', showPanelOptions, false);
	$$('#panel-inflation #icon-options').addEventListener('click', showPanelOptions, false);
	// Go back
	$$('#panel-balances  .icon-left').addEventListener('click', showPanelLogin, false);
	$$('#panel-history   .icon-left').addEventListener('click', showPanelBalances, false);
	$$('#panel-payment   .icon-left').addEventListener('click', showPanelBalances, false);
	$$('#panel-offers    .icon-left').addEventListener('click', showPanelBalances, false);
	$$('#panel-trustline .icon-left').addEventListener('click', showPanelBalances, false);
	$$('#panel-inflation .icon-left').addEventListener('click', showPanelBalances, false);
	$$('#panel-options   .icon-left').addEventListener('click', goBack, false);
	// Options
	$$('#panel-options #check-theme').addEventListener('click', toggleTheme, true);
	// Events
	$$('#panel-offers #buy-amount').addEventListener('keyup',  updateOfferForm, false);
	$$('#panel-offers #buy-price').addEventListener('keyup',   updateOfferForm, false);
	$$('#panel-offers #sell-amount').addEventListener('keyup', updateOfferForm, false);
	$$('#panel-offers #sell-price').addEventListener('keyup',  updateOfferForm, false);

}


function checkLastLink() {
	//console.log('Checking link...');
	var uri  = parseSchema(window.location.href);
	var link = uri.parameters['link'];
	if(link){ /* Opened as notification window */
		onLastLink(link);
	} else {
		// Request link to page
		// This works in the popup, not the notify window, should be tab id for secondary window not current
		if(inExtension) {
	    	chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
	    		chrome.tabs.sendMessage(tabs[0].id, {from: 'popup', subject: 'last-link'}, onLastLink);
	    		//chrome.tabs.sendMessage(tabs[0].id, {from: 'popup', subject: 'links'}, onLinks);
	    	});
	    } else {
	    	log('Not in extension');
	    }
	}
}

function onLinks(links) {
	//console.log('Back from content script');
	//console.log(links);
	if(links.length>0){ 
		var schema = parseSchema(links[0]);
		//console.log(schema);
		// TODO: Verify operation is 'pay'
		$('address').value = schema.parameters['destination'] || '';
		$('amount').value  = schema.parameters['amount'] || '';
		$('notes').value   = schema.parameters['memo'] || '';
	}
}

function onLastLink(link) {
	//console.log('Link found...', link);
	if(link){ 
		currentLink = link;
		var schema = parseSchema(link);
		//console.log(schema);
		// TODO: Verify operation is 'pay'
		$$('#panel-payment #address').value = schema.parameters['destination'] || '';
		$$('#panel-payment #amount').value  = schema.parameters['amount'] || '';
		$$('#panel-payment #notes').value   = schema.parameters['memo'] || '';
		$$('#panel-payment #issuer').value  = schema.parameters['issuer'] || '';
		$$('#panel-payment #asset').value   = schema.parameters['asset_code'] || 'XLM';
	}
}


//---- UTILS ----------------------------------------

function log(str) {
    //if(DEBUG) { console.log(str); }
}

function dateShort(time) {
	var date = new Date(time);
	if(!date){ return 'Jan 01'; }
	var mm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
	var dy = date.getDate();
	var dd = (dy<10 ? '0'+dy : dy);
	var text = mm+' '+dd;
	return text;
}

function issuerShort(issuer) {
	return issuer ? issuer.substr(0,10) : 'Stellar';
}

function getAsset(code) {
	//if(!code){ return 'XLM' }
	return code || 'XLM';
}

// web+stellar:pay?amount=10&destination=GBANK7OKSC2AVD6HQM65XRBHBH3F76PYDHJCWLVUDR5JBVWFGLVQMPZA
function parseSchema(uri) {
	var url = new URL(uri);
	var params = {};
	url.searchParams.forEach((v,k)=>{ params[k] = v; })

	return {
		protocol:   url.protocol,
		operation:  url.pathname,
		parameters: params
	};	
}

function parseSchemaOLD(uri) {
	var params   = {};
	var parts    = uri.split(':',2);
	var protocol = parts[0];
	var rest     = parts[1];
	    parts    = rest.split('?',2);
	var optype   = parts[0];
	    rest     = parts[1];
	    parts    = rest.split('&');

    for (var i=0; i<parts.length; i++) {
    	var item = parts[i].split('=',2);
    	var key  = item[0];
    	var val  = item[1];
    	params[key] = val;
    }

	return {
		protocol:   protocol,
		operation:  optype,
		parameters: params
	};
}

function money(text, dec=2, comma=true, dimdec=false, blankZero=false) {
	if(text==''){ return blankZero?'':(0).toFixed(dec); }
	var num = 0;
	if(comma){
		num = parseFloat(text).toLocaleString("en", {minimumFractionDigits: dec, maximumFractionDigits: dec});
	} else {
		num = parseFloat(text).toFixed(dec);
	}
	if(dimdec && dec>0){
		var parts = num.split('.');
		num = parts[0] + '<dec>.' + parts[1]+ '</dec>';
	}
	return num;
}


// END