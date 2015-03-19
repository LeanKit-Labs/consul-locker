var Locker = require( "./Locker.fsm.js" );
var consulFactory = require( "./consul.js" );

module.exports = function( _config ) {

	var consul = consulFactory( _config );

	return {
		create: function( options ) {
			return new Locker( options, consul );
		}
	};

};