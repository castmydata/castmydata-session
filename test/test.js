var should = require('should');
var request = require('request');
var fs = require('fs');
var path = require('path');
var rmdir = require('rmdir-sync');
var url = 'http://localhost:8080';
var apiUrl = url + '/db/mochatest/';
var dotenv = require('dotenv').config({
    path: path.join(__dirname, '.castmydata.env')
});
var endpoint;

// cleanup localstorage
var localStoragePath = path.join(__dirname, '..', 'scratch');
rmdir(localStoragePath);
fs.mkdirSync(localStoragePath);

// require castmydata client
var client = require('castmydata-jsclient');
var clientSession = require('../client/src/castmydata-session');

describe('CastMyData MongoDB Tests', function() {

    var CastMyData = require('castmydata-server');
    var castmydata = new CastMyData();
    var castmydataSession = new require('../server/castmydata-session');

    castmydata.register(castmydataSession);

    this.timeout(5000);

    var api = request.defaults({
        headers: {
            'content-type': 'application/json',
            'Authorization': 'Bearer ' + process.env.API_TOKEN
        }
    });

    before(function(done) {
        endpoint = new client.Endpoint(url, 'sessiontest');
        castmydata.startup(done);
    });

    after(function(done) {
        this.timeout = 10000;
        endpoint.close();
        castmydata.shutdown(done);
    });

    // todo
});