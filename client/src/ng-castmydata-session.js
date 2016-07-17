(function() {
    'use strict';

    angular.module('NgCastMyDataSession', [])
        .factory('NgCastMyDataSession', ['CastMyDataServer',
            function(CastMyDataServer) {
                CastMyData.Session.prototype.bindToScope = function($scope, param) {
                    var self = this;
                    $scope[param] = this.data;
                    this.on('load update', function() {
                        $scope[param] = self.data;
                        try {
                            $scope.$digest();
                        } catch (e) {}
                    });
                    return this;
                };
                return new CastMyData.Session(CastMyDataServer);
            }
        ]);
}).call(this);