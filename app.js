'use strict';

const express = require('express');
const app = express();
const router = express.Router();
const port = 8445;
const ip = "https://letsauth.org/api";
const clientauth = require('./clientauth');
const photoContest = require('./photoContest');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const hbs = require('hbs');
const hbsUtils = require('hbs-utils')(hbs);
const path = require('path');
const bodyParser = require('body-parser');

app.use(cookieParser());
// Add the body parser middleware.
app.use(bodyParser.json());                              // ?
app.use(bodyParser.urlencoded({ extended: false }));     // ?
app.engine('html', require('hbs').__express);
hbsUtils.registerPartials('./views/templates/');
/*hbs.registerHelper('formatDate', function(date) {
    return date.toString();
});*/
hbsUtils.precompilePartials();
app.set('views', path.join("", './views'));
app.set('view engine', 'html');
app.set('view options', {layout: true});

// Add headers
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,id,filename');

    // Pass to next layer of middleware
    next();
});

let public_dir = path.join(__dirname, 'public');

// Put static after the headers so that the headers are included here too
app.use(express.static(public_dir));



let defaultFailure = function(res,error) {
    console.log("Error: "+error || "Error");
    res.status(500).send("Error: "+error || "Error");
};

function requireLogin(req,res,next) {
    clientauth.checkedLoggedIn(req,()=> {
        //req.query.info = info;
        console.log("Logged in");
        next();
    }, () => {
        res.status(403).send("Not Authorized");
    }, false);
}

// Init the login function. Send the qr code. 1st step.
app.post('/api/login', (req,res) => {
    clientauth.checkedLoggedIn(req,() => {
        res.setHeader('Access-Control-Expose-Headers', 'isLoggedIn');
        res.setHeader('isloggedin', true);
        res.status(200).send("");
    }, (qrCodeHtml, id, loginUrl)=> {
        res.setHeader('Access-Control-Expose-Headers', 'id,isLoggedIn');
        res.setHeader('id', id);
        res.setHeader('isloggedin', false);
        res.status(200).send({html: qrCodeHtml, url:loginUrl});
    });
});

//
app.get('/api/loginFromPhone', (req,res) => {
    clientauth.loginFromPhone(req, (connection)=>{
        console.log("Success");
        res.send("success");
    }, (error)=> {
        defaultFailure(res,error);
    });
});

// gets the images
app.get('/api/getuseraccount', requireLogin, (req, res) => {
    photoContest.showUserAccount(req,res);
});

// gets the images
app.get('/api/getfeed', (req, res) => {
    photoContest.showFeed(req,res);
});

app.post('/api/uploadphoto', requireLogin, (req, res) => {
    photoContest.uploadPhoto(req,res);
});

app.put('/api/saveuserinfo', requireLogin, (req, res) => {
    photoContest.saveUserInfo(req,res);
});

app.post('/api/logout', (req,res) => {
    clientauth.logout(req,()=>{
        res.status(200).send("Logged out");
    }, (error)=> {
        defaultFailure(res,error);
    })
});

app.put('/api/saveImage', (req,res) => {
    photoContest.saveImage(req,res);
});

app.get('/api/showExistingTokens', (req,res) => {
    clientauth.sendUserNameTokens(req,(info)=>{
        res.send(JSON.stringify(info));
    }, (error)=> {
        defaultFailure(res,error);
    })
});

// Done with ClientAuth?
app.get('/api/register', (req,res) => {
    clientauth.register(req,()=>{
        res.send("Registered");
    });
});

/*app.get('/deleteAccount', (req,res) => {
    clientauth.deleteAccount(req,()=>{
        res.send("Deleted Account");
    });
});*/

app.get('/api/test/', (req,res) => {
    /*let pki = require('node-forge').pki;

    let caCert;
    let caStore;
    let cert;

    try {
        caCert = fs.readFileSync('exampleCert.pem').toString();
        caStore = pki.createCaStore([ caCert ]);
    } catch (e) {
        console.log('Failed to load CA certificate (' + e + ')');
        return;
    }

    try {
        pki.verifyCertificateChain(caStore, [ caCert ]);
    } catch (e) {
        //return handleResponse(new Error('Failed to verify certificate (' + e.message || e + ')'));
        console.log(e);
    } */
    var x509 = require('x509.js');
    var parsedData = x509.parseCert(fs.readFileSync('exampleCert.pem'));
    var a = parsedData;
});

app.get('/images/*', (req,res) => {
    	
});

clientauth.load(ip);
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
