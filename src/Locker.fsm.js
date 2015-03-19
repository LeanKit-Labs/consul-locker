var debug = require( "debug" )( "consul-locker:fsm" );
var _ = require( "lodash" );
var util = require( "util" );
var when = require( "when" );
var machina = require( "machina" );

var Locker = machina.Fsm.extend( {
	initialize: function( options, consul, strategy ) {
		debug( "Initializing Locker FSM" );
		this.consul = consul;

		this.sessionName = options.name;
		this.sessionId;

		this.keyFormat = util.format( "%s/%s/lock", this.sessionName );
		this.lockValue = {
			pid: process.pid
			// This will be the body of the lock value
			// It should identify this process as the leader
		};

		debug( "Locker Name: %s", this.sessionName );

		this.rebootCount = 0;
		this.maxRetries = options.maxRetries || 10;
		this.retryInterval = ( options.retryInterval || 30 ) * 1000;

		this.strategy = strategy( this );
	},

	_getKey: function( id ) {
		return util.format( this.keyFormat, id );
	},

	_startSession: function() {
		return this.consul.session.create( { name: this.sessionName, lockdelay: "0s" } )
			.then( function( result ) {
				var session = result[ 0 ];
				debug( "Session acquired with id %s", session.ID );
				this.sessionId = session.ID;

				this.emit( "session.start", this.sessionId );

				return session;
			}.bind( this ) );
	},

	_endSession: function() {
		return this.consul.session.destroy( this.sessionId )
			.then( function( result ) {
				this.emit( "session.end", this.sessionId );
				this.sessionId = undefined;
			}.bind( this ) );
	},

	_lock: function( id ) {
		var key = this._getKey( id );

		debug( "Acquiring key %s with sessionId: %s", key, this.sessionId );

		if ( _.isFunction( this.strategy.getLock ) ) {
			var lock = this.strategy.getLock( key );
			if ( lock ) {
				return lock;
			}
		}

		var deferred = when.defer();

		var promise = deferred.promise;

		this.emit( "lock.request", { key: key, value: promise } );

		var options = {
			key: key,
			value: JSON.stringify( this.lockValue ),
			acquire: this.sessionId
		};

		var onSuccess = function( result ) {
			if ( result[ 0 ] === false ) {
				return deferred.reject( new Error( "Already locked" ) );
			}
			return deferred.resolve( result[ 0 ] );
		};

		this.consul.kv.set( options ).then( onSuccess, deferred.reject );

		var onResolve = function() {
			this.emit( "lock.response", { key: key, value: true } );
		}.bind( this );

		var onReject = function() {
			this.emit( "lock.response", { key: key, value: false } );
		}.bind( this );

		promise.then( onResolve, onReject );

		return promise;
	},

	_release: function( id ) {
		var key = this._getKey( id );
		debug( "Releasing key %s", key );
		var options = {
			key: key,
			value: "",
			release: this.sessionId
		};

		this.emit( "lock.release", { key: key } );

		return this.consul.kv.set( options );
	},

	initialState: "acquiring",
	states: {
		acquiring: {
			_onEnter: function() {
				debug( "Acquiring..." );
				var onSuccess = function( session ) {
					this.transition( "ready" );
				}.bind( this );

				var onFail = function( err ) {
					debug( "Session could not be created: %s", err.toString() );
					// Should probably do something useful here like try to reconnect
					console.log( "Error acquiring session" );
					console.log( err );
					this.reboot();
				}.bind( this );

				this._startSession().then( onSuccess, onFail );
			},
			lock: function() {
				this.deferUntilTransition( "ready" );
			},
			release: function( id, deferred ) {
				var key = this._getKey( id );
				this.emit( "lock.release", { key: key } );
				return deferred.resolve( true );
			}
		},
		ready: {
			_onEnter: function() {
				this.rebootCount = 0;
			},
			lock: function( id, deferred ) {
				debug( "Attempting to lock id: %s", id );
				return this._lock( id ).then( deferred.resolve, deferred.reject );
			},
			release: function( id, deferred ) {
				var key = this._getKey( id );
				this.emit( "lock.release", { key: key } );
				return this._release( id ).then( deferred.resolve, deferred.reject );
			}
		},

		paused: {
			lock: function() {
				this.deferUntilTransition( "ready" );
			},
			release: function() {
				this.deferUntilTransition( "ready" );
			}
		},

		stopped: {
			_onEnter: function() {
				if ( this.sessionId ) {
					this._endSession();
				}
			},
			lock: function( id, deferred ) {
				return deferred.reject( new Error( "Locking session has ended" ) );
			},

			release: function( id, deferred ) {
				return deferred.reject( new Error( "Locking session has ended" ) );
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
	},

	start: function() {
		this.transition( "acquiring" );
	},

	stop: function() {
		return this._endSession()
			.then( function() {
				this.transition( "stopped" );
			}.bind( this ) );
	},

	reboot: function() {
		this.transition( "paused" );
		this.rebootCount++;

		if ( this.rebootCount <= this.maxRetries ) {
			setTimeout( function() {
				this.start();
			}.bind( this ), this.retryInterval );
		} else {
			this.transition( "stopped" );
			console.error( "Retry limit exceeded. Shutting down locker." );
		}
	}
} );

module.exports = Locker;