//----------------------------------------
// Mooney 1.2
//
// Content script
//----------------------------------------

var lastLink = null;

//console.log('Content script loaded');
//console.log('ID', chrome.runtime.id);

function sendMessage(subject, data) {
    var msg = { from: 'content', subject: subject, data: data };
    chrome.runtime.sendMessage(msg);
}


document.body.addEventListener('click', handleClick);

function handleClick(evt) {
    var target = evt.target;
    var link = null;
    if(target.tagName.toLowerCase()=='a'){ link = target.href; }
    else {
        var found = false;
        while(target.tagName.toLowerCase()!='a'){ 
            if(!target.parentNode || target.tagName.toLowerCase()=='body'){ break; }
            target = target.parentNode;
            if(target.tagName.toLowerCase()=='a'){ link = target.href; break; }
        }
    }
    //console.log('LINK', link);
    if(link){
        //console.log('Check Schema');
        var schema = parseSchema(link);
        if(schema.protocol=='web+stellar:'){
            lastLink = link;
            //console.log('Schema parsed', schema);
            evt.preventDefault();
            evt.stopPropagation();
            sendMessage('notify', lastLink);
            
            //sendMessage('setBadge', null);
            //sendMessage('showPageAction', schema); // update wallet data
            //sendMessage('schema', schema); // update wallet data
        }
    }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(msg, sender, callback) {
    //console.log('Message received in script', msg);
    if ((msg.from === 'popup') && (msg.subject === 'last-link')) {
        //console.log('Message from popup asking for last link');
        //console.log(lastLink);
        callback(lastLink);  // Directly respond to the sender (popup) through the specified callback
    }
    if ((msg.from === 'popup') && (msg.subject === 'links')) {
        //console.log('Message from popup asking for links');
        // Collect the necessary data 
        var links = [];
        for(var i=0; i<document.links.length; i++) {
            links.push(document.links[i].href);
        }
        //console.log(links);
        callback(links);  // Directly respond to the sender (popup) through the specified callback
    }
});

//checkForPaymentLinks();

function checkForPaymentLinks() {
    var count = 0;
    var links = document.links;

    for (var i = 0; i < links.length; i++) {
        if(links[i].href.substr(0,12)=='web+stellar:'){
            //console.log(links[i].href);
            count++;
        }
    }

    if(count>0){ 
        // update red bubble counter
        // send links to popup
        if(count==1){
            var uri = links[0].href;
            var schema = parseSchema(uri);
            sendMessage('schema', schema); // update wallet data
        }
    }
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
        parts    = rest.split('/',2);
    var optype   = rest[0];
        rest     = rest[1];
        parts    = rest.split('&');

    for (var i = 0; i < parts.length; i++) {
        var item = parts[i].split('=',2);
        var key  = item[0];
        var val  = item[1];
        params[key] = val;
    }

    return {
        protocol: protocol,
        operation: optype,
        parameters: params
    };
}


// END