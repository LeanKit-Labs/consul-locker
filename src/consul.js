var _ = require( "lodash" );
var lift = require( "when/node" ).lift;
var consulFactory = require( "consul" );

var toLift = {
	kv: [ "get", "keys", "set", "del" ],
	session: [ "create", "destroy", "get", "node", "list", "renew" ]
};

module.exports = function( _config ) {
	var consul = consulFactory( _config );

	return consul;
};