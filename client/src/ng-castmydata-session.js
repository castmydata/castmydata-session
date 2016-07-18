(function() {
    'use strict';

    angular.module('NgCastMyDataSession', [])
        .factory('NgCastMyDataSession', ['CastMyDataServer', '$timeout',
            function(CastMyDataServer, $timeout) {
                CastMyData.Session.prototype.bindToScope = function($scope, param) {
                    var self = this;
                    $scope[param] = this.data;
                    this.on('load set delete clear destroy set:error delete:error clear:error', function(data, event) {
                        $scope[param] = self.data;
                        $timeout(function() {
                            $scope.$digest();
                        });
                    });
                    return this;
                };
                return new CastMyData.Session(CastMyDataServer);
            }
        ]);
}).call(this);