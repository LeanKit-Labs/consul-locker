var debug = require( "debug" )( "consul-locker:fsm" );
var _ = require( "lodash" );
var util = require( "util" );
var when = require( "when" );
var machina = require( "machina" );

var Locker = machina.Fsm.extend( {
	initialize: function( options, consul, strategy ) {
		debug( "Initializing Locker FSM" );
		this.consul = consul;
		this.strategy = strategy;

		this._cache = {};

		this.sessionName = options.name;
		this.sessionId;

		this.keyFormat = util.format( "%s/%s/lock", this.sessionName );
		this.lockValue = {
			pid: process.pid
			// This will be the body of the lock value
			// It should identify this process as the leader
		};

		debug( "Locker Name: %s", this.sessionName );

	},

	_getKey: function( id ) {
		return util.format( this.keyFormat, id );
	},

	_startSession: function() {
		return this.consul.session.create( { name: this.sessionName } );
	},

	_endSession: function() {
		return this.consul.session.destroy( this.sessionId );
	},

	_lock: function( id ) {
		var key = this._getKey( id );
		var cached = this._cache[ key ];

		// Check to see if this key has already been acquired
		if ( cached === true ) {
			// It has
			return when.resolve( true );
		} else if ( cached && _.isFunction( cached.then ) ) {
			// This request is already in flight
			// Return the cached promise
			return cached;
		}

		var cacheDeferred = when.defer();

		var promise = cacheDeferred.promise;

		debug( "Acquiring key %s with sessionId: %s", key, this.sessionId );

		var options = {
			key: key,
			value: JSON.stringify( this.lockValue ),
			acquire: this.sessionId
		};

		var onSuccess = function( result ) {
			if ( result[ 0 ] === false ) {
				return cacheDeferred.reject( new Error( "Already locked" ) );
			}
			return cacheDeferred.resolve( result[ 0 ] );
		};

		this.consul.kv.set( options ).then( onSuccess, cacheDeferred.reject );

		var onResolve = function() {
			this._cache[ key ] = true;
		}.bind( this );

		var onReject = function() {
			this._cache[ key ] = false;
		}.bind( this );

		promise.then( onResolve, onReject );

		this._cache[ key ] = promise;

		return promise;
	},

	_removeFromCache: function( id ) {
		var key = this._getKey( id );
		if ( this._cache[ key ] ) {
			this._cache[ key ] = undefined;
		}
	},

	_release: function( id ) {
		var key = this._getKey( id );
		debug( "Releasing key %s", key );
		var options = {
			key: key,
			value: "",
			release: this.sessionId
		};

		return this.consul.kv.set( options );
	},

	_wait: function( id ) {},

	initialState: "acquiring",
	states: {
		acquiring: {
			_onEnter: function() {
				debug( "Acquiring..." );
				var onSuccess = function( result ) {
					var session = result[ 0 ];
					debug( "Session acquired with id %s", session.ID );
					this.sessionId = session.ID;
					this.transition( "ready" );
				}.bind( this );

				var onFail = function( err ) {
					debug( "Session could not be created: %s", err.toString() );
					// Should probably do something useful here like try to reconnect
					console.log( "Error acquiring session" );
					console.log( err );
				}.bind( this );

				this._startSession().then( onSuccess, onFail );
			},
			lock: function() {
				this.deferUntilTransition( "ready" );
			},
			release: function( id, deferred ) {
				this._removeFromCache( id );
				return deferred.resolve( true );
			}
		},
		ready: {
			lock: function( id, deferred ) {
				debug( "Attempting to lock id: %s", id );
				return this._lock( id ).then( deferred.resolve, deferred.reject );
			},
			release: function( id, deferred ) {
				this._removeFromCache( id );
				return this._release( id ).then( deferred.resolve, deferred.reject );
			}
		},
		stopped: {
			_onEnter: function() {
				if ( this.sessionId ) {
					this._endSession();
				}
			}
		}
	},

	lock: function( id ) {
		var deferred = when.defer();
		this.handle( "lock", id, deferred );
		return deferred.promise;
	},

	release: function( id ) {
		var deferred = when.defer();
		this.handle( "release", id, deferred );
		return deferred.promise;
	}
} );

module.exports = Locker;