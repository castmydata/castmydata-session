var path = require('path');
var randomName = require('node-random-name');
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
        app.io.use(function(socket, done) {
            if (!socket.session.get('user')) {
                socket.session.setProtected('user', {
                    id: Math.floor(Math.random() * 1000),
                    name: randomName(),
                    isAdmin: (Math.random() > 0.9)
                });
            }
            done();
        });
    },
    startup: function(app, done) {
        app.express.get('/session', function(req, res) {
            res.json(req.session.get());
        });
        app.express.get('/session/destroy', function(req, res) {
            req.session.destroy(function(error) {
                if (error) {
                    res.status(500).json({
                        error: error.message
                    });
                    return;
                }
                res.json(200);
            });
        });
        done();
    }
});
castmydata.startup();