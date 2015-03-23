var _ = require( "lodash" );
var lift = require( "when/node" ).lift;
var consulFactory = require( "consul" );

var toLift = {
	kv: [ "get", "keys", "set", "del" ],
	session: [ "create", "destroy", "get", "info", "node", "list", "renew" ]
};

module.exports = function( _config ) {
	var consul = consulFactory( _config );

	_.each( toLift, function( methods, key ) {
		_.each( methods, function( m ) {
			consul[ key ][ m ] = lift( consul[ key ][ m ] );
		} );
	} );

	return consul;
};