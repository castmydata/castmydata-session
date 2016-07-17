// jshint esversion: 6
(function() {
    "use strict";

    var cookie = require('cookie');
    var redis = require('redis');
    var go = require('getobject');
    var redisSessionKey = 'session-store';

    function Session(parent, id) {
        this.id = id;
        this.parent = parent;
        this.data = {};
        this.protectedPaths = parent.protectedPaths;
    }

    Session.prototype.destroy =
        Session.prototype.clear = function(callback) {
            this.set('', {}, callback);
    };

    Session.prototype.load = function(done) {
        var self = this;
        this.parent.redis.get(`${redisSessionKey}#${this.id}`, function(err, data) {
            if (err) return done(err);
            data = JSON.parse(data || '{}');
            for (var key in data) {
                self.data[key] = data[key];
            }
            done(null);
        });
    };

    Session.prototype.touch = function(done) {
        done = done || function() {};
        this.parent.redis.expire(`${redisSessionKey}#${this.id}`, this.parent.expiry, function(err) {
            if (err) return done(err);
            done(null);
        });
    };

    Session.prototype.save = function(done) {
        var self = this;
        this.parent.redis.set(`${redisSessionKey}#${this.id}`, JSON.stringify(this.data), function(err) {
            if (err) return done(err);
            self.touch(done);
        });
    };

    Session.prototype.set = function(path, value, callback) {
        var rule = new RegExp(`^${path}`);
        var isProtected = false;
        for (var protectedPath in this.protectedPaths) {
            if (rule.test(protectedPath) && !isProtected) {
                isProtected = true;
            }
            if (this.protectedPaths[protectedPath].test(path) && !isProtected) {
                isProtected = true;
            }
        }
        if (isProtected) {
            return callback(new Error(`Path ${path} is protected`));
        }
        this.setProtected(path, value, callback);
    };

    Session.prototype.setProtected = function(path, value, callback) {
        callback = callback || function() {};
        if (!path) {
            this.data = value;
        } else {
            go.set(this.data, path, value);
        }
        this.parent.app.pubsub.emit('castmydata-session#update:' + this.id, this.data);
        this.save(callback);
    };

    Session.prototype.get = function(path, defaults) {
        if (!path) return this.data;
        return (go.get(this.data, path) || defaults);
    };

    function CastMyDataSession() {}

    CastMyDataSession.prototype.register = function(app) {
        console.log('Registering CastMyData Session Plugin');
        var self = this;
        this.app = app;

        // Get session expiry in minutes
        this.expiry = app.get('session.expiry', 20) * 60;
        console.log(`Sessions are set to expire in ${(this.expiry) / 60} minutes`);

        // create ACL
        app.options.acl[redisSessionKey] = {
            all: function(query, callback) {
                callback(new Error('Access Denied'));
            },
            find: function(oldData, callback) {
                callback(new Error('Access Denied'));
            },
            sync: function(callback) {
                callback(new Error('Access Denied'));
            },
            post: function(newData, callback) {
                callback(new Error('Access Denied'));
            },
            put: function(oldData, newData, callback) {
                callback(new Error('Access Denied'));
            },
            delete: function(oldData, callback) {
                callback(new Error('Access Denied'));
            },
            clear: function(callback) {
                callback(new Error('Access Denied'));
            },
            listen: function(channel, callback) {
                callback(new Error('Access Denied'));
            },
            unlisten: function(channel, callback) {
                callback(new Error('Access Denied'));
            },
            broadcast: function(request, callback) {
                callback(new Error('Access Denied'));
            }
        };

        // create store
        var redisConfigs = {
            host: app.get('REDIS_HOST', 'localhost'),
            port: app.get('REDIS_PORT', 6379),
            db: app.get('REDIS_DB', 0),
            password: app.get('REDIS_PASS') || undefined,
        };
        this.redis = redis.createClient(redisConfigs);

        app.io.use(function(socket, next) {
            var cookies = cookie.parse(socket.handshake.headers.cookie);
            if (!cookies['cmd.sid']) return next(new Error('cmd.sid not found'));
            socket.session = new Session(self, cookies['cmd.sid']);
            socket.sid = cookies['cmd.sid'];
            if (socket.path == 'session') {
                socket.on('session:load', function() {
                    var data = socket.session.get();
                    socket.emit('session:update', data);
                    socket.session.touch();
                });
                socket.on('session:set', function(request) {
                    socket.session.set(request.path, request.value, function(err) {
                        if (err) return socket.emit(`session:set:${request.path}:deny`, err.message);
                        socket.emit(`session:set:${request.path}:ok`);
                    });
                });
                app.pubsub.on('castmydata-session#update:' + socket.sid, function(path, data) {
                    socket.emit('session:update', data);
                });
                // touch session every 60 seconds
                var interval = setInterval(function() {
                    socket.session.touch();
                }, 1000 * 60);
                socket.conn.on('close', function() {
                    clearInterval(interval);
                });
            }
            socket.session.load(next);
        });
    };

    CastMyDataSession.prototype.startup = function(app, done) {
        console.log('Starting Up CastMyData Session Plugin');
        var self = this;

        app.express.use(function(req, res, next) {
            var cookies = cookie.parse(req.headers.cookie);
            if (!cookies['cmd.sid']) {
                return res.status(500).json({
                    error: 'cmd.sid not found',
                    stack: []
                });
            }
            req.session = new Session(self, cookies['cmd.sid']);
            req.session.load(function(err) {
                if (err) {
                    return res.status(500).json({
                        error: err.message,
                        stack: err.stack
                    });
                }
                next();
            });
        });
        done();
    };

    CastMyDataSession.prototype.protectedPaths = {};

    CastMyDataSession.prototype.protect = function(key) {
        this.protectedPaths[key] = new RegExp(`^${key}`);
    };

    CastMyDataSession.prototype.unprotect = function(key) {
        if (this.protectedPaths[key]) {
            delete this.protectedPaths[key];
        }
    };

    CastMyDataSession.prototype.shutdown = function(app, done) {
        console.log('Shutting Down CastMyData Session Plugin');
        this.redis.quit();
        done();
    };

    module.exports = CastMyDataSession;

}).call(global);