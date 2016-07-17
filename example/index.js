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
castmydata.register({
    register: function(app) {
        app.io.use(function(socket, done){
            socket.session.setProtected('user', {
                id: 1,
                name: 'John Doe',
                isAdmin: true
            });
            done();
        });
    }
});
castmydata.startup();