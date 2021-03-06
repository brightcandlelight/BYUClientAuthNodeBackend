const fs = require('fs');
const multiparty = require('multiparty');
const uuid = require('uuid');
const clientauth = require('./clientauth');
const moment = require('moment');

const points = {"1st": 0.75, "2nd": 0.50, "3rd": 0.25, "good": 0.10};

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
        isCurrentWeek: true,
        points: 0
    };
    if (!data.images) {
        data.images = [];
    }
    for (let i in data.images) {
        const value = data.images[i];
        if (value.date === body.date) {
            data.images[i] = body;
            clientauth.saveCache();
            return;
        }
    }

    // If we have gotten here, we are not replacing the current photo so add a new one
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
    const allUsers = clientauth.getAllUsersObj(req);
    const certId = clientauth.getUserCertId(req);
    const photos = [];
    for (const key in allUsers) {
        if (allUsers[key].data) {
            const username = (allUsers[key].data.userInfo) ? allUsers[key].data.userInfo.username : "";
            for (const photo of allUsers[key].data.images || []) {
                const clone = {};
                Object.assign(clone, photo);
                clone.username = username;
                calculateDynamicData(clone, certId);
                photos.push(clone);
            }
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

let getImage = function(req, filename) {
    const allUsers = clientauth.getAllUsersObj(req);
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
    const image = getImage(req, filename);
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
            } else {
                image[key] = req.body[key];
                if (key === "winners" && points[req.body.winners]) {
                    if (!image.points) { image.points = 0; }
                    image.points += points[req.body.winners];
                }
            }
        }
        clientauth.saveCache();
        calculateDynamicData(image,certId);
    }
    res.status(200).send(image);
}

module.exports.saveUserInfo = saveUserInfo;
module.exports.showFeed = showFeed;
module.exports.showUserAccount = showUserAccount;
module.exports.uploadPhoto = uploadPhoto;
module.exports.saveImage = saveImage;