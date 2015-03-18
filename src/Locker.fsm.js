var debug = require( "debug" )( "locker:fsm" );
var util = require( "util" );
var when = require( "when" );
var machina = require( "machina" );

var Locker = machina.Fsm.extend( {
	initialize: function( options, consul, strategy ) {
		debug( "Initializing Locker FSM" );
		this.consul = consul;
		this.strategy = strategy;

		this.locks = {};

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
		return when.promise( function( resolve, reject ) {
			this.consul.session.create( { name: this.sessionName }, function( err, session, response ) {
				if ( err ) {
					debug( "Error creating session: %s", error.toString() );
					return reject( err );
				}
				debug( "Session created successfully" );
				return resolve( session );
			} );
		}.bind( this ) );
	},

	_endSession: function() {
		return this.consul.session.destroy( this.sessionId );
	},

	_lock: function( id ) {
		var key = this._getKey( id );
		debug( "Acquiring key %s with sessionId: %s", key, this.sessionId );
		return when.promise( function( resolve, reject ) {
			var options = {
				key: key,
				value: JSON.stringify( this.lockValue ),
				acquire: this.sessionId
			};
			this.consul.kv.set( options, function( err, result ) {
				if ( err ) {
					debug( "Locking error: %s", err.toString() );
					return reject( err );
				}

				if ( result === false ) {
					return reject( new Error( "Already locked" ) );
				}

				resolve( result );
			} );
		}.bind( this ) );
	},

	_release: function( id ) {
		var key = this._getKey( id );
		return this.consul.kv.set( key, null, {
			release: this.sessionId
		} );
	},

	_wait: function( id ) {},

	initialState: "acquiring",
	states: {
		acquiring: {
			_onEnter: function() {
				debug( "Acquiring..." );
				var onSuccess = function( session ) {
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
			release: function() {
				return when.resolve( true );
			}
		},
		ready: {
			lock: function( id, deferred ) {
				debug( "Attempting to lock id: %s", id );
				return this._lock( id ).then( deferred.resolve, deferred.reject );
			},
			release: function( id ) {
				return this._release( id );
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
		return this.handle( "release", id );
	}
} );

module.exports = Locker;