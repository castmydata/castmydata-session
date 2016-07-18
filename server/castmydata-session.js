// jshint esversion: 6
(function() {
    "use strict";

    var cookie = require('cookie');
    var redis = require('redis');
    var go = require('getobject');
    var unset = require('unset-value');
    var redisSessionKey = 'session-store';

    function Session(parent, id) {
        this.id = id;
        this.parent = parent;
        this.data = {};
        this.protectedPaths = parent.protectedPaths;
    }

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

    Session.prototype.save = function(done) {
        var self = this;
        this.parent.redis.set(`${redisSessionKey}#${this.id}`, JSON.stringify(this.data), function(err) {
            if (err) return done(err);
            self.touch(done);
        });
    };

    Session.prototype.touch = function(done) {
        done = done || function() {};
        this.parent.redis.expire(`${redisSessionKey}#${this.id}`, this.parent.expiry, function(err) {
            if (err) return done(err);
            done(null);
        });
    };

    Session.prototype.canModify = function(path) {
        var canModify = true;
        var rule = new RegExp(`^${path}`);
        for (var protectedPath in this.protectedPaths) {
            if (rule.test(protectedPath) && canModify) {
                canModify = false;
            }
            if (this.protectedPaths[protectedPath].test(path) && canModify) {
                canModify = false;
            }
        }
        return canModify;
    };

    Session.prototype.get = function(path, defaults) {
        if (!path) return this.data;
        return (go.get(this.data, path) || defaults);
    };

    Session.prototype.set = function(path, value, callback) {
        if (!this.canModify(path)) {
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
        this.parent.app.pubsub.emit('castmydata-session#set:' + this.id, this.data);
        this.save(callback);
    };

    Session.prototype.delete = function(path, callback) {
        if (!go.exists(this.data, path)) {
            return callback(new Error(`Path ${path} not found`));
        }
        if (!this.canModify(path)) {
            return callback(new Error(`Path ${path} is protected`));
        }
        this.deleteProtected(path, callback);
    };

    Session.prototype.deleteProtected = function(path, callback) {
        unset(this.data, path);
        this.parent.app.pubsub.emit(`castmydata-session#delete:${this.id}`, this.data);
        this.save(callback);
    };

    Session.prototype.clear = function(callback) {
        for (var path in this.data) {
            if (this.canModify(path)) {
                delete this.data[path];
            }
        }
        this.parent.app.pubsub.emit('castmydata-session#clear:' + this.id, this.data);
        this.save(callback);
    };

    Session.prototype.destroy = function(callback) {
        var self = this;
        this.setProtected('', {}, function(err) {
            self.parent.redis.del(`${redisSessionKey}#${self.id}`, function(err) {
                self.parent.app.pubsub.emit('castmydata-session#destroy:' + self.id, self.data);
                callback(null);
            });
        });
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
                    socket.emit('session:set', data);
                    socket.session.touch();
                });
                socket.on('session:set', function(request) {
                    socket.session.set(request.path, request.value, function(err) {
                        if (err) return socket.emit(`session:set:${request.path}:deny`, err.message);
                        socket.emit(`session:set:${request.path}:ok`);
                    });
                });
                socket.on('session:delete', function(request) {
                    socket.session.delete(request.path, function(err) {
                        if (err) return socket.emit(`session:delete:${request.path}:deny`, err.message);
                        socket.emit(`session:delete:${request.path}:ok`);
                    });
                });
                socket.on('session:clear', function() {
                    socket.session.clear(function(err) {
                        if (err) return socket.emit(`session:clear:deny`, err.message);
                        socket.emit(`session:clear:ok`);
                    });
                });
                app.pubsub.on('castmydata-session#set:' + socket.sid, function(path, data) {
                    socket.emit('session:set', data);
                });
                app.pubsub.on('castmydata-session#delete:' + socket.sid, function(path, data) {
                    socket.emit('session:delete', data);
                });
                app.pubsub.on('castmydata-session#clear:' + socket.sid, function(path, data) {
                    socket.emit('session:clear', data);
                });
                app.pubsub.on('castmydata-session#destroy:' + socket.sid, function() {
                    socket.emit('session:destroy');
                    setTimeout(function() {
                        socket.conn.close();
                    });
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