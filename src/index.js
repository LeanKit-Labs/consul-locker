var Locker = require( "./Locker.fsm.js" );
var consulFactory = require( "./consul.js" );

var strategies = {
	permanent: require( "./strategies/permanent" )
};

var defaultStrategy = "permanent";

module.exports = function( _config ) {

	var consul = consulFactory( _config );

	return {
		create: function( _options ) {
			var options = _options;

			if ( !options.strategy ) {
				options.strategy = defaultStrategy;
			}

			var strategy = strategies[ options.strategy ];

			if ( !strategy ) {
				throw new Error( "Locker Strategy Not Found: " + options.strategy );
			}

			return new Locker( options, consul, strategy );
		}
	};

};