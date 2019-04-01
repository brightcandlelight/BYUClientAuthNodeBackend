const fs = require('fs');
const multiparty = require('multiparty');
const uuid = require('uuid');
const clientauth = require('./clientauth');
const moment = require('moment');

function uploadPhoto(req,res) {
    console.log(req.headers.filename);
    let contents = [];
    req.on('data', chunk => {
        contents.push(chunk);
    });
    req.on('end', () => {
        contents=contents.map(e=>{
            return e.toString(); // convert Buffer to string
        }).join("").split(';base64,').pop();
        //contents = new Buffer(contents, 'base64');
        //contents = new File([contents.blob()], req.headers.filename);
        const filename = uuid.v4() + req.headers.filename;
        fs.writeFile("public/images/" + filename, contents, {encoding: "base64"}, (error) => {
            if (error) {
                console.log(error);
                res.status(500).send(error);
            } else {
                saveFileToUser(req, filename);
                res.status(200).send("Success");
            }
        });
    });
    req.on('error', (error) => {
        contents = null;
        res.status(500).send(error);
    });
}

let getCurrentWeek = function() {
    return moment().isoWeek() - 8;
};


let saveFileToUser = function(req, filename) {
    const data = clientauth.getUserDataObj(req);
    const body = {
        filename: filename,
        url: "images/" + filename,
        fulldate: new Date(),
        date: moment().format("YYYY/MM/DD"),
        week: getCurrentWeek(),
        likes: 0,
        likedUsers: [],
        categories: [],
        isCurrentWeek: true
    };
    if (!data.images) {
        data.images = [];
    }
    data.images.push(body);
    clientauth.saveCache();
};

let calculateDynamicData = function(image, certId) {
    // Calculate likes
    image.likes = image.likedUsers ? image.likedUsers.length : 0;
    image.likedByUser = image.likedUsers.includes(certId);

    // Calculate if it is still in the current week.
    // You can only like those that are in the current week
    if (image.isCurrentWeek && image.week !== getCurrentWeek()) {
        image.isCurrentWeek = false;
    }
};

function showUserAccount(req,res) {
    const data = clientauth.getUserDataObj(req);
    const certId = clientauth.getUserCertId(req);
    if (!data.images) {
        data.images = [];
    }
    if (!data.userInfo) {
        data.userInfo = {username: data.username};
    }
    for (const image of data.images || []) {
        calculateDynamicData(image, certId);
    }
    res.status(200).send(JSON.stringify(data));
}

function showFeed(req,res) {
    const allUsers = clientauth.getAllUsersObj();
    const certId = clientauth.getUserCertId(req);
    const photos = [];
    for (const key in allUsers) {
        const username = allUsers[key].data.userInfo ? allUsers[key].data.userInfo.username : "";
        for (const photo of allUsers[key].data.images || []) {
            const clone = {};
            Object.assign(clone, photo);
            clone.username = username;
            calculateDynamicData(clone, certId);
            photos.push(clone);
        }
    }
    res.status(200).send({images:photos});
}

function saveUserInfo(req,res,next) {
    const data = clientauth.getUserDataObj(req);
    if (!data.userInfo) {
        data.userInfo = {};
    }
    for (let i in req.body) {
        data.userInfo[i] = req.body[i];
    }
    res.status(200).send(data.userInfo);
    clientauth.saveCache();
}

let getImage = function(filename) {
    const allUsers = clientauth.getAllUsersObj();
    for (const key in allUsers) {
        for (const photo of allUsers[key].data.images || []) {
            if (photo.filename === filename) {
                return photo;
            }
        }
    }
    return null;
};

function saveImage(req,res,next) {
    const filename = req.body.filename;
    const image = getImage(filename);
    const certId = clientauth.getUserCertId(req);
    if (image !== null) {
        delete req.body.filename;

        for (let key in req.body || {}) {
            if (key === "likedByUser" && req.body[key]) {
                if (!image.likedUsers.includes(certId)) {
                    image.likedUsers.push(certId);
                }
            } else if (key === "likedByUser" && !req.body[key]) {
                if (image.likedUsers.includes(certId)) {
                    image.likedUsers.splice(image.likedUsers.indexOf(certId),1);
                }
            } else if (key === "categories" && certId === "C1") {
                image.categories = req.body[key];
            }
        }
        clientauth.saveCache();
        calculateDynamicData(image,certId);
    }
    res.status(200).send(image);
}

function downloadImage(req,res,next) {
    let EMSKey=req.sanitize(req.query.EMSKey);
    let gedcomName=req.sanitize(req.query.gedcomName);

    // Force it to download as a file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader("Content-disposition", "attachment;filename=\"" + gedcomName+"\"");
    aggregationClient.downloadGedcom(EMSKey,gedcomName, res);
}

/**/


module.exports.saveUserInfo = saveUserInfo;
module.exports.showFeed = showFeed;
module.exports.showUserAccount = showUserAccount;
module.exports.uploadPhoto = uploadPhoto;
module.exports.saveImage = saveImage;