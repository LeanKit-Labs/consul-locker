var debug = require( "debug" )( "consul-locker:permanent" );
var when = require( "when" );
var _ = require( "lodash" );

function Strategy( locker ) {
	this.initialize( locker );
}

_.extend( Strategy.prototype, {

	initialize: function( locker ) {
		this._cache = {};

		locker.on( "lock.request", this._onLockRequest.bind( this ) );
		locker.on( "lock.response", this._onLockResponse.bind( this ) );
		locker.on( "lock.release", this._onLockRelease.bind( this ) );
		locker.on( "session.end", this._onSessionEnd.bind( this ) );
	},

	_onLockRequest: function( data ) {
		this._cache[ data.key ] = data.value;
	},

	_onLockResponse: function( data ) {
		this._cache[ data.key ] = data.value;
	},

	_onLockRelease: function( data ) {
		delete this._cache[ data.key ];
	},

	_onSessionEnd: function() {
		this._cache = {};
	},

	getLock: function( key ) {
		var cached = this._cache[ key ];

		// Check to see if this key has already been acquired
		if ( cached === true ) {
			// It has
			debug( "Key %s already exists in cache", key );
			return when.resolve( true );
		} else if ( cached && _.isFunction( cached.then ) ) {
			// This request is already in flight
			// Return the cached promise
			debug( "Key %s has already been requested.", key );
			return cached;
		}

		return undefined;

	}

} );

module.exports = function( locker ) {
	return new Strategy( locker );
};