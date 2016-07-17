(function(global, factory) {
    'use strict';
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        factory(exports, global);
    } else {
        factory((global.CastMyData = (global.CastMyData || {})), global);
    }
}(this, function(exports, global) {
    'use strict';

    var utils = {};

    var localStorage;
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        var LocalStorage = require('node-localstorage').LocalStorage;
        localStorage = new LocalStorage('./scratch');
    } else {
        localStorage = window.localStorage;
    }

    // for nodejs
    var document = global.document || {
        cookie: ''
    };

    // https://github.com/makeable/uuid-v4.js/blob/master/uuid-v4.js
    (function(scope) {
        var dec2hex = [];
        for (var i = 0; i <= 15; i++) {
            dec2hex[i] = i.toString(16);
        }
        var UUID = function() {
            var uuid = '';
            for (var i = 1; i <= 36; i++) {
                if (i === 9 || i === 14 || i === 19 || i === 24) {
                    uuid += '-';
                } else if (i === 15) {
                    uuid += 4;
                } else if (i === 20) {
                    uuid += dec2hex[(Math.random() * 4 | 0 + 8)];
                } else {
                    uuid += dec2hex[(Math.random() * 15 | 0)];
                }
            }
            return uuid;
        };
        scope.uuid = UUID;
    })(utils);

    //https://github.com/jgallen23/cookie-monster/blob/master/lib/cookie-monster.js
    (function(scope) {
        var monster = {
            set: function(name, value, days, path, secure) {
                var date = new Date(),
                    expires = '',
                    type = typeof(value),
                    valueToUse = '',
                    secureFlag = '';
                path = path || "/";
                if (days) {
                    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                    expires = "; expires=" + date.toUTCString();
                }
                if (type === "object" && type !== "undefined") {
                    if (!("JSON" in window)) throw "Bummer, your browser doesn't support JSON parsing.";
                    valueToUse = encodeURIComponent(JSON.stringify({
                        v: value
                    }));
                } else {
                    valueToUse = encodeURIComponent(value);
                }
                if (secure) {
                    secureFlag = "; secure";
                }
                document.cookie = name + "=" + valueToUse + expires + "; path=" + path + secureFlag;
            },
            get: function(name) {
                var nameEQ = name + "=",
                    ca = document.cookie.split(';'),
                    value = '',
                    firstChar = '',
                    parsed = {};
                for (var i = 0; i < ca.length; i++) {
                    var c = ca[i];
                    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
                    if (c.indexOf(nameEQ) === 0) {
                        value = decodeURIComponent(c.substring(nameEQ.length, c.length));
                        firstChar = value.substring(0, 1);
                        if (firstChar == "{") {
                            try {
                                parsed = JSON.parse(value);
                                if ("v" in parsed) return parsed.v;
                            } catch (e) {
                                return value;
                            }
                        }
                        if (value == "undefined") return undefined;
                        return value;
                    }
                }
                return null;
            },
            remove: function(name) {
                this.set(name, "", -1);
            },
            increment: function(name, days) {
                var value = this.get(name) || 0;
                this.set(name, (parseInt(value, 10) + 1), days);
            },
            decrement: function(name, days) {
                var value = this.get(name) || 0;
                this.set(name, (parseInt(value, 10) - 1), days);
            }
        };
        scope.cookies = monster;
    })(utils);

    // https://github.com/cowboy/node-getobject/blob/master/lib/getobject.js
    (function(scope) {
        var getobject = scope.go = {};

        function getParts(str) {
            return str.replace(/\\\./g, '\uffff').split('.').map(function(s) {
                return s.replace(/\uffff/g, '.');
            });
        }
        getobject.get = function(obj, parts, create) {
            if (typeof parts === 'string') {
                parts = getParts(parts);
            }
            var part;
            while (typeof obj === 'object' && obj && parts.length) {
                part = parts.shift();
                if (!(part in obj) && create) {
                    obj[part] = {};
                }
                obj = obj[part];
            }
            return obj;
        };
        getobject.set = function(obj, parts, value) {
            parts = getParts(parts);
            var prop = parts.pop();
            obj = getobject.get(obj, parts, true);
            if (obj && typeof obj === 'object') {
                return (obj[prop] = value);
            }
        };
        getobject.unset = function(obj, prop) {
            if (obj.hasOwnProperty(prop)) {
                delete obj[prop];
            }
            if (getobject.get(obj, prop)) {
                var segs = prop.split('.');
                var last = segs.pop();
                while (segs.length && segs[segs.length - 1].slice(-1) === '\\') {
                    last = segs.pop().slice(0, -1) + '.' + last;
                }
                while (segs.length) obj = obj[prop = segs.shift()];
                return (delete obj[last]);
            }
        };
        getobject.exists = function(obj, parts) {
            parts = getParts(parts);
            var prop = parts.pop();
            obj = getobject.get(obj, parts);
            return typeof obj === 'object' && obj && prop in obj;
        };
    })(utils);

    function Eev() {
        this._events = {};
    }
    Eev.prototype = {
        on: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                if (!me._events[name]) me._events[name] = [];
                me._events[name].push(fn);
            });
            return this;
        },

        off: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                var list = me._events[name];
                if (list) {
                    me._events[name] = me._events[name].filter(function(fn) {
                        return fn !== fn;
                    });
                }
            });
            return this;
        },

        once: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                if (!me._events[name]) me._events[name] = [];
                fn._callOnce = true;
                me._events[name].push(fn);
            });
            return this;
        },

        emit: function(name, data, context) {
            var me = this;
            context = context || this;
            var evt = this._events[name] || (this._events[name] = []);
            evt.forEach(function(fn) {
                if (fn._callOnce) {
                    delete fn._callOnce;
                    fn.call(context, data, name);
                    me.off(name, fn);
                    return me;
                }
                fn.call(context, data, name);
            });
            return this;
        }
    };

    // setup cookies
    if (!utils.cookies.get('cmd.sid')) {
        utils.cookies.set('cmd.sid', utils.uuid(), 365 * 10);
        // i'll be damned if in 10 years people are still using this library
    }

    function Session(CastMyDataServer) {
        var self = this;
        this._storage = localStorage;
        this._events = {};
        var socket = this._socket = ((typeof io !== 'undefined') ? io : require('socket.io-client'))
            (CastMyDataServer + '?path=session', {
                multiplex: false
            });
        socket.on('session:set', function(data) {
            self.data = data;
            self.save();
            self.emit('set');
        });
        socket.on('session:delete', function(data) {
            self.data = data;
            self.save();
            self.emit('delete');
        });
        socket.on('session:clear', function(data) {
            self.data = data;
            self.save();
            self.emit('clear');
        });
        socket.on('reconnect', function() {
            self.load();
        });
        this.load();
    }

    Session.prototype = Object.create(Eev.prototype);

    Session.prototype.load = function() {
        var data = (this._storage.getItem('castmydata-session') || '{}');
        this.data = JSON.parse(data);
        this.emit('load');
        this._socket.emit('session:load');
    };

    Session.prototype.set = function(path, value) {
        var self = this;
        var original = JSON.parse(JSON.stringify(this.data));
        utils.go.set(this.data, path, value);
        this.emit('set');

        function revert(error) {
            self.data = original;
            self.emit('set:error', error);
        }
        this._socket.once('session:set:' + path + ':deny', revert);
        this._socket.once('session:set:' + path + ':ok', function() {
            self._socket.off('session:set:' + path + ':deny', revert);
        });
        this._socket.emit('session:set', {
            path: path,
            value: value
        });
    };

    Session.prototype.delete = function(path) {
        var self = this;
        if (!utils.go.exists(this.data, path)) {
            return this.emit('delete:error', 'Path ' + path + ' does not exist');
        }
        var original = JSON.parse(JSON.stringify(this.data));
        utils.go.unset(this.data, path);
        this.emit('delete');

        function revert(error) {
            self.data = original;
            self.emit('delete:error', error);
        }
        this._socket.once('session:delete:' + path + ':deny', revert);
        this._socket.once('session:delete:' + path + ':ok', function() {
            self._socket.off('session:delete:' + path + ':deny', revert);
        });
        this._socket.emit('session:delete', {
            path: path
        });
    };

    Session.prototype.clear = function() {
        var self = this;
        var original = JSON.parse(JSON.stringify(this.data));
        this.data = {};
        this.emit('clear');

        function revert(error) {
            self.data = original;
            self.emit('clear:error', error);
        }
        this._socket.once('session:clear:deny', revert);
        this._socket.once('session:clear:ok', function() {
            self._socket.off('session:clear:deny', revert);
        });
        this._socket.emit('session:clear');
    };

    Session.prototype.save = function() {
        var data = this.data || {};
        this._storage.setItem('castmydata-session', JSON.stringify(data));
        this.emit('save');
    };

    exports.Session = Session;
}));