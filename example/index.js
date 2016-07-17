var path = require('path');
var dotenv = require('dotenv').config({
    path: path.join(__dirname, '.castmydata.env')
});
var CastMyData = require('castmydata-server');
var CastMyDataSession = require('../server/castmydata-session');
var castmydata = new CastMyData();
var session = new CastMyDataSession();
session.protect('user');
castmydata.register(session);
castmydata.startup();