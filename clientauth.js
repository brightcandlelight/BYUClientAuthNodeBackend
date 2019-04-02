const qrcode = require('qrcode-generator');
const crypto = require('crypto');
const fs = require('fs');
const uuid = require('uuid');

let ip;
let all_JSON = { };
// {info: {name, expires, token}, connection:{ip,port,connection, etc}}
const cache_file = "cache.txt";
let lastSaved = 0;

const QR_TYPE_NUMBER = 13;
const QR_ERROR_CORRECTION_LEVEL = "L";
const ALL_USERS = "C_ALL";

// Internal method for creating the sha hash.
let getShaHash = function(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
};

let getMinutesSince1970 = function() {
    return new Date() / 1000 / 60| 0;
};

let getExpires = function(min=2) {
    return new Date((new Date()).getTime() + min*60000);
    //return date.setHours(date.getHours(),date.getMinutes(),0,0);
};

function saveCache() {
    fs.writeFile(cache_file, JSON.stringify(all_JSON), (err) => {
        if (err) {
            console.log("Error writing cache file");
        } else {
            console.log('Cache file has been saved!');
        }
    });
    lastSaved = getMinutesSince1970();
}

function loadCache(ipaddr) {
    ip = ipaddr;
    if (Object.keys(all_JSON).length === 0) {
        // Cache is empty, loadCache from disk
        fs.exists(cache_file, (exists) => {
            // Is we have a cache, load it at the beginning
            if (exists) {
                fs.readFile(cache_file, 'utf8', function (err, data) {
                    if (err) {
                        console.log("Error loading cache");
                    } else if (data) {
                        all_JSON = JSON.parse(data);
                        console.log("Loaded cache");
                    }
                });
            } else {
                console.log("Cache file does not exist, skipping");
            }
        });  
    }
    if (!all_JSON.users) {
        all_JSON.users = {};
    }
}

// Can logout by both the phone and cookies
function logout(req,success,failure) {
    const id = req.headers.id;
    console.log(id);
    if (all_JSON.users[id] !== undefined) {
        let item = all_JSON.users[id];
        all_JSON.users[item.certId].connections.filter((value,index,arr) => {
            return value !== id;
        });
        delete all_JSON.users[id];
        saveCache();
    }
    success();
}

//RequestLogin
//See if client has been authorized for that token, if so return cookies for client.
//Otherwise, try again
/*function requestLogin(req,res,success,failure) {
    if (all_JSON.users[req.query.id] !== undefined) {
        success(all_JSON.users[req.query.id]);
    } else {
        failure("User not logged in");
        initConnection(req,res,success,failure);
    }
}*/

let tokenInDatabase = function(id) {
    if (all_JSON.users[id]) {
        return true;
    } else {
        return false;
    }
};

function checkPermissions(id,req,funcIsLoggedIn,funcNotLoggedIn, displayLogin=true) {
    if (tokenInDatabase(id) && new Date(all_JSON.users[id].expires) > new Date() &&
            req.connection.remoteAddress === all_JSON.users[id].address) {
        let query = "?id="+id;
        funcIsLoggedIn({id:all_JSON.users[id], ip, query});
    } else {
        if (displayLogin) {
            funcNotLoggedIn(...requestLogin(req));
        } else {
            funcNotLoggedIn();
        }
    }
}

//region loginFromPhone
let requestRevoked = function(req) {
    return true;
};

let validateCerts = function(req) {
    return true;
};

let addTokenToDatabase = function(connection,certId) {
    connection.certId = certId;
    //const userInfo = { username: connection.username };
    //connection.userInfo = userInfo;
    all_JSON.users[connection.id] = connection;

    all_JSON.users[certId].connections.push(connection.id);
};

function loginFromPhone(req,success,failure) {
    if (!req.body || !req.body.certId) {
        failure("Missing data");
        return;
    }

    let connection = req.body;
    console.log("ID"+connection.id);
    if (all_JSON.users[connection.id] === undefined) {
        console.log("New user");
    }

    // Make sure the account has first been created
    if (requestRevoked(req) && validateCerts(req) && all_JSON.users[req.body.certId]) {
        addTokenToDatabase(connection,req.body.certId);
    } else {
        failure("Unable to verify account");
        return;
    }
    //console.log(JSON.stringify(all_JSON.users));
    
    saveCache();
    success(connection);
}
//endregion

function sendUserNameTokens(req,success,failure) {
    if (requestRevoked(req) && validateCerts(req)) {
        success(all_JSON.users[req.query.certId] || []);
    } else {
        failure();
    }
}

let validateRegistrationCode = function(code) {
    return true;
};


function createaccount(req,funcNotLoggedIn,failure) {
    console.log("CA "+JSON.stringify(req.body));
    const certId = "C"+getShaHash(JSON.stringify(req.body.username));
    console.log("CertId: "+certId);
    const register = req.body.register;
    req.body.isAdmin = false;

    // Add to the list this certId has
    if (!all_JSON.users[certId] && validateRegistrationCode(register)) {
        all_JSON.users[certId] = {connections:[], data:req.body};

        // Add to the list of all users
        if (!all_JSON.users[ALL_USERS]) {
            all_JSON.users[ALL_USERS] = [];
        }
        if (!all_JSON.users[ALL_USERS].includes(certId)) {
            all_JSON.users[ALL_USERS].push(certId);
        }
        req.body.certId = certId;
        funcNotLoggedIn(...requestLogin(req));
    } else if (validateRegistrationCode(register)) {
        failure("Username already exists");
    } else {
        failure("Invalid registration code");
    }
}

function deleteAccount(req,success,failure) {
    success();
    logout(req,success,failure);
}

function generateUniqueUUID(prefix="U") {
    let id = prefix+uuid.v4();
    while (all_JSON.users[id] !== undefined) {
        id = prefix+uuid.v4();
    }
    return id;
}

// This is now the backend. The id will be passed to us in the body
function getId(req) {
    const id = req.headers && req.headers.id ? req.headers.id : undefined;
    console.log("Id:"+id);
    return {id:id, hasId: !!id};
}

function getUserCertId(req) {
    let id = getId(req).id;
    console.log("B"+id);
    if (id === undefined) {
        return undefined;
    }
    return all_JSON.users[id] ? all_JSON.users[id].certId : undefined;
}

function getUserDataObj(req) {
    return all_JSON.users[getUserCertId(req)].data;
}

function getAllUsersObj() {
    let list = {};
    for (let key in all_JSON.users[ALL_USERS]) {
        list[all_JSON.users[ALL_USERS][key]] = all_JSON.users[all_JSON.users[ALL_USERS][key]];
    }
    return list;
}

let requestLogin = function(req) {
    let id = generateUniqueUUID();
    let connection = {id, address: req.connection.remoteAddress, expires: getExpires(50)};
    for (let key in req.body || {}) {
        if (connection[key] === undefined) {
            connection[key] = req.body[key];
        }
    }
    let query = encodeURI(JSON.stringify(connection));
    const loginUrl = JSON.stringify(connection); //ip+'/api/loginFromPhone?conn='+query;

    let qr = qrcode(QR_TYPE_NUMBER, QR_ERROR_CORRECTION_LEVEL);
    qr.addData(query); //JSON.stringify(connection);
    qr.make();
    console.log(loginUrl);
    const html = qr.createImgTag();

    return [html, id, loginUrl];
};

//InitConnection
//If no cookie, send client a unique token with unique id, ip address, and anything else we want in it.
//Token goes into qr code
//(If cookie, just passthrough and check the cookie)
function checkedLoggedIn(req,funcIsLoggedIn, funcNotLoggedIn, displayLogin=true) {
    const idObject = getId(req);
    console.log("C"+JSON.stringify(idObject));
    if (!idObject.hasId) {
        if (displayLogin) {
            funcNotLoggedIn(...requestLogin(req));
        } else {
            funcNotLoggedIn();
        }
    } else {
        checkPermissions(idObject.id,req,funcIsLoggedIn,funcNotLoggedIn, displayLogin);
    }
}

// Token generated by browser that can't be spoofed.
/*function checkOrRequestLogin(req,res,success,failure) {
    let id = uuid.v4();
    console.log(id);
    let connection = {address: req.connection.remoteAddress, expires: getExpires(2)};
    connection.id = getShaHash(JSON.stringify(connection));
    let query = "?conn="+encodeURI(JSON.stringify(connection));
    //console.log(JSON.stringify(connection));
    //console.log(JSON.stringify(all_JSON.users));
    if (all_JSON.users[connection.id] && all_JSON.users[connection.id].expires < new Date()) {
        console.log("Expired");
    }
        
    if (all_JSON.users[connection.id] === undefined || (all_JSON.users[connection.id].expires < new Date())) {
        let typeNumber = 10;
        let errorCorrectionLevel = 'L';
        let qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.addData(ip+'/login'+query);
        qr.make();
        let html = qr.createImgTag();
        
        res.status(200).send('<meta http-equiv="refresh" content="4"/> <!-- 4 sec interval-->Login<div>'+html+'</div><script></script>');
        failure();
    } else {
        res.status(200).send("Now I am validated. Info: "+JSON.stringify(all_JSON.users[connection.id])+"<br><br><a href=\""+ip+"/logout"+query+"\">Logout</a><br>");
        success();
    }
}*/

module.exports.loginFromPhone = loginFromPhone;
module.exports.logout = logout;
module.exports.createaccount = createaccount;
module.exports.deleteAccount = deleteAccount;
//module.exports.checkOrRequestLogin = checkOrRequestLogin;
module.exports.load = loadCache;
//module.exports.requestLogin = requestLogin;
module.exports.checkPermissions = checkPermissions;
module.exports.checkedLoggedIn = checkedLoggedIn;
module.exports.sendUserNameTokens = sendUserNameTokens;
//module.exports.generateUniqueUUID = generateUniqueUUID;
module.exports.getId = getId;
module.exports.getUserDataObj = getUserDataObj;
module.exports.saveCache = saveCache;
module.exports.getAllUsersObj = getAllUsersObj;
module.exports.getUserCertId = getUserCertId;