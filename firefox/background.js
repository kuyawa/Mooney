//----------------------------------------
// Mooney 1.2
//
// Background script
//----------------------------------------


//navigator.registerProtocolHandler("web+stellar","popup.html?uri=%s","Mooney");

// On install
chrome.runtime.onInstalled.addListener(function(details) {
	//if ((details.reason === 'install'){ }
	var version = chrome.runtime.getManifest().version;
	//console.log('Mooney '+version+' installed');
	//console.log('Extension ID', chrome.runtime.id);

	chrome.storage.local.get('appkey', function(data) {
		var appkey = data.appkey;

		if(!appkey){  /* FIRST TIME */
			var appkey = generateKey();

		    chrome.storage.local.set({appkey: appkey}, function() {
		        //console.log('AppKey', appkey);
		    });
		}
	});

});

// Listener
chrome.runtime.onMessage.addListener(function (msg, sender, response) {
	//console.log('Message received in background', msg);

    // CONTENT
    if ((msg.from === 'content') && (msg.subject === 'showPageAction')) {
        chrome.pageAction.show(sender.tab.id);  // Enable the page-action for the requesting tab
    }
    if ((msg.from === 'content') && (msg.subject === 'setBadge')) {
    	// setBadge(sender.tab.id); NOT WORKING
    }
    if ((msg.from === 'content') && (msg.subject === 'schema')) {
    	chrome.runtime.sendMessage({ from: 'background', subject: 'schema', data: msg.data });
    }
    if ((msg.from === 'content') && (msg.subject === 'notify')) {
        notify(msg.data);  // Send nothing back
    }

    // POPUP
    if ((msg.from === 'popup') && (msg.subject === 'save-account')) {
        saveAccount(msg.data);
    }
    if ((msg.from === 'popup') && (msg.subject === 'load-account')) {
        loadAccount();
    }
    if ((msg.from === 'popup') && (msg.subject === 'logout')) {
    	clearAccount();
    }
});

function sendMessage(subject, data){
    chrome.runtime.sendMessage({ from: 'background', subject: subject, data: data });
}

function saveAccount(secret) {
    if(!secret){ sendMessage('account-saved', false); return; }

    encryptKey(secret, encrypted=>{
        //console.log('token', encrypted);
        if(!encrypted) { sendMessage('account-saved', false); return; }
        chrome.storage.local.set({token: encrypted}, function() {
            //console.log('ACCOUNT SAVED');
            sendMessage('account-saved', true);
        });
    });
}

function loadAccount() {
    //console.log('Loading account...');

    chrome.storage.local.get('token', function(data) {
        var token = data.token;
        //console.log('token', token);
        if(!token){ sendMessage('account-loaded', null); return; }

        decryptKey(token, secret=>{
            var account = { publicKey: null, secretKey: secret };
            sendMessage('account-loaded', account);
        });
    });
}

function clearAccount() {
    //console.log('Clearing account...');

    chrome.storage.local.remove('token', function() {
        //console.log('token removed');
        sendMessage('account-cleared', true);
    });
}

function notify(link) {
	//var uri    = escape(link);  // Link must be urlencoded
	var uri    = encodeURIComponent(link);  // Link must be urlencoded
	var width  = 415; //520;
	var height = 518; //620;
	var left   = parseInt((screen.width/2)-(width/2));
    var top    = parseInt((screen.height/2)-(height/2));
    //chrome.windows.create({ url: 'popup.html?link='+uri, type: 'popup', width: width, height: height, left: left, top: top });
    browser.windows.create({ url: '/popup.html?link='+uri, type: 'popup', width: width, height: height, left: left, top: top }).then(window=>{
        setTimeout(resizeit, 100, window.id); // Stupid hack to show the popup instead of blank 
    });
    //browser.windows.create({ url: 'moz-extension://5cc9f59c-49dd-4944-b923-8dba226176d4/popup.html?link='+uri, type: 'panel', width: width, height: height, left: left, top: top });
    //browser.browserAction.openPopup()
}

function resizeit(id) {
    browser.windows.update(id, {height:520});
}

function setBadge(tabId) {
	chrome.browserAction.setBadgeText({tabId: tabId, text: "1"});
    chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
}

// UTILS

function $(id) { return document.getElementById(id); }
function epoch() { return (new Date()).getTime(); }

function bytesToHex(bytes) {
    var hex = '';
    var char;

    for(var i = 0, len = bytes.byteLength; i < len; i += 1) {
        char = bytes[i].toString(16);
        if(char.length < 2) { char = '0' + char; }
        hex += char;
    }

    return hex;
}

function stringToBuffer(str) {
    var bytes = new Uint8Array(str.length);

    for (var i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }

    return bytes;
}

function bufferToString(buffer) {
    var str = '';

    for (var i = 0; i < buffer.byteLength; i++) 
    {
        str += String.fromCharCode(buffer[i]);
    }

    return str;
}

function generateKey() {
    var buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    var hex = '';
    for (var i = 0; i < buffer.length; ++i) {
        hex += buffer[i].toString(16);
    }
    return hex;
}

//var appVector = [57, 244, 247, 25, 19, 223, 251, 111, 30, 52, 38, 177, 220, 174, 213, 123]; // Random stuff
var appVector = 'NTcsMjQ0LDI0NywyNSwxOSwyMjMsMjUxLDExMSwzMCw1MiwzOCwxNzcsMjIwLDE3NCwyMTMsMTIz';

function encryptKey(secret, callback) {
    chrome.storage.local.get('appkey', function(data) {
        var appkey = data.appkey;
        crypto.subtle.digest({name: "SHA-256"}, stringToBuffer(appkey)).then(function(result){
            crypto.subtle.importKey("raw", result, {name: "AES-CBC"}, false, ["encrypt", "decrypt"]).then(function(key){
                var vector = new Uint8Array(atob(appVector).split(','));
                crypto.subtle.encrypt({name: "AES-CBC", iv: vector}, key, stringToBuffer(secret)).then(function(result){
                    var encrypted = new Uint8Array(result);
                    var base64 = btoa(encrypted);
                    callback(base64);
                }).catch(function(e){
                    callback(null);
                });
            }).catch(function(e){
                callback(null);
            });
        });
    });
}

function decryptKey(encrypted, callback) {
    chrome.storage.local.get('appkey', function(data) {
        var appkey = data.appkey;
        crypto.subtle.digest({name: "SHA-256"}, stringToBuffer(appkey)).then(function(result){
            crypto.subtle.importKey("raw", result, {name: "AES-CBC"}, false, ["encrypt", "decrypt"]).then(function(key){
                var buffer = new Uint8Array(atob(encrypted).split(','));
                var vector = new Uint8Array(atob(appVector).split(','));
                crypto.subtle.decrypt({name: "AES-CBC", iv: vector}, key, buffer).then(function(result){
                    var decrypted = new Uint8Array(result);
                    var secret = bufferToString(decrypted);
                    callback(secret);
                }).catch(function(e){
                    callback(null);
                });
            }).catch(function(e){
                callback(null);
            });
        });
    });
}


function keyToBase64(key) {
    var bytes  = new Uint8Array(key);
    var base64 = btoa(bytes);
}

function base64ToKey(base64, callback) {
    var chars = atob(base64);
    var bytes = chars.split(',');
    crypto.subtle.importKey("raw", bytes, {name: "AES-CBC"}, false, ["encrypt", "decrypt"]).then(function(key){
        callback(key);
    });
}


// END