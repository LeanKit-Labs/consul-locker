require( "../setup.js" );

var Locker;
var consul;
var strategy;

describe( "Locker FSM", function() {

	before( function() {
		Locker = require( "../../src/Locker.fsm.js" );
		consul = {
			session: {
				create: sinon.stub(),
				destroy: sinon.stub()
			},
			kv: {
				set: sinon.stub()
			}
		};
		strategy = function( locker ) {
			return {
				getLock: sinon.stub()
			};
		};
	} );

	describe( "when initializing", function() {
		var myLocker;
		before( function() {
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );
		} );

		it( "should set the name from options", function() {
			myLocker.sessionName.should.equal( "myServiceWriter" );
		} );
	} );

	describe( "when getting a key", function() {
		var myLocker;
		var key;
		before( function() {
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );
			key = myLocker._getKey( 123 );
		} );

		it( "should produce the correct key format", function() {
			key.should.equal( "myServiceWriter/123/lock" );
		} );
	} );

	describe( "when starting a session", function() {
		var myLocker;
		var session = { ID: "session321" };
		var eventMsg;
		before( function( done ) {
			consul.session.create.reset();
			consul.session.create.resolves( [ session ] );
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

			myLocker.on( "session.start", function( msg ) {
				eventMsg = msg;
			} );

			myLocker._startSession().then( function() {
				done();
			} );
		} );

		after( function() {
			consul.session.create.reset();
		} );

		it( "should create the session with the correct body", function() {
			consul.session.create.should.have.been.calledWith( { name: "myServiceWriter", lockdelay: "0s" } );
		} );

		it( "should set the session id", function() {
			myLocker.sessionId.should.equal( "session321" );
		} );

		it( "should emit a session start event", function() {
			eventMsg.should.equal( "session321" );
		} );
	} );

	describe( "when ending a session", function() {
		var myLocker;
		var sessionId = "session456";
		var eventMsg;
		before( function( done ) {
			consul.session.destroy.reset();
			consul.session.destroy.resolves( true );
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

			myLocker.sessionId = sessionId;

			myLocker.on( "session.end", function( msg ) {
				eventMsg = msg;
			} );

			myLocker._endSession().then( function() {
				done();
			} );
		} );

		after( function() {
			consul.session.destroy.reset();
		} );

		it( "should destroy the session with the correct id", function() {
			consul.session.destroy.should.have.been.calledWith( sessionId );
		} );

		it( "should clear the session id", function() {
			should.not.exist( myLocker.sessionId );
		} );

		it( "should emit a session end event", function() {
			eventMsg.should.equal( sessionId );
		} );

	} );


	describe( "when releasing a key", function() {
		var myLocker;
		var eventMsg;
		before( function( done ) {
			consul.kv.set.reset();
			consul.kv.set.resolves( true );
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

			myLocker.sessionId = "mysession123";

			myLocker.on( "lock.release", function( msg ) {
				eventMsg = msg;
			} );

			myLocker._release( 456 ).then( function() {
				done();
			} );
		} );

		after( function() {
			consul.kv.set.reset();
		} );

		it( "should set the key with correct options", function() {
			consul.kv.set.should.have.been.calledWith( {
				key: "myServiceWriter/456/lock",
				value: "",
				release: "mysession123"
			} );
		} );

		it( "should emit a lock release event", function() {
			eventMsg.should.eql( {
				key: "myServiceWriter/456/lock"
			} );
		} );
	} );

	describe( "when acquiring a lock", function() {
		var myLocker;
		before( function() {
			consul.kv.set.reset();
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

			myLocker.sessionId = "mysession123";

		} );

		after( function() {
			consul.kv.set.reset();
			myLocker.strategy.getLock.reset();
		} );

		describe( "when it can be retrieved from the strategy", function() {
			var result;
			before( function( done ) {
				myLocker.strategy.getLock.resolves( true );

				myLocker._lock( 456 ).then( function( _result ) {
					result = _result;
					done();
				} );
			} );

			it( "should receive the correct value", function() {
				result.should.equal( true );
			} );

			it( "should not attempt to contact consul", function() {
				consul.kv.set.should.not.have.been.called;
			} );
		} );

		describe( "when the request fails", function() {
			var result;
			var requestEvent;
			var responseEvent;
			var expectedError = new Error( "Network problem" );
			var receivedError;
			before( function( done ) {

				consul.kv.set.rejects( expectedError );

				myLocker.strategy.getLock.returns( undefined );

				myLocker.on( "lock.request", function( data ) {
					requestEvent = data;
				} );

				myLocker.on( "lock.response", function( data ) {
					responseEvent = data;
				} );

				result = myLocker._lock( 456 );

				result.then( null, function( err ) {
					receivedError = err;
					done();
				} );

			} );

			after( function() {
				consul.kv.set.reset();
				myLocker.strategy.getLock.reset();
			} );

			it( "should reject with the error", function() {
				receivedError.should.eql( expectedError );
			} );

			it( "should emit a lock request event", function() {
				requestEvent.should.eql( {
					key: "myServiceWriter/456/lock",
					value: result
				} );
			} );

			it( "should emit a lock response event", function() {
				responseEvent.should.eql( {
					key: "myServiceWriter/456/lock",
					value: false
				} );
			} );

		} );

		describe( "when the request succeeds", function() {
			describe( "when the lock is denied", function() {
				var result;
				var requestEvent;
				var responseEvent;
				var expectedError = new Error( "Already locked" );
				var receivedError;
				before( function( done ) {

					consul.kv.set.resolves( [ false ] );

					myLocker.strategy.getLock.returns( undefined );

					myLocker.on( "lock.request", function( data ) {
						requestEvent = data;
					} );

					myLocker.on( "lock.response", function( data ) {
						responseEvent = data;
					} );

					result = myLocker._lock( 456 );

					result.then( null, function( err ) {
						receivedError = err;
						done();
					} );

				} );

				after( function() {
					consul.kv.set.reset();
					myLocker.strategy.getLock.reset();
				} );

				it( "should reject with the error", function() {
					receivedError.should.eql( expectedError );
				} );

				it( "should emit a lock request event", function() {
					requestEvent.should.eql( {
						key: "myServiceWriter/456/lock",
						value: result
					} );
				} );

				it( "should emit a lock response event", function() {
					responseEvent.should.eql( {
						key: "myServiceWriter/456/lock",
						value: false
					} );
				} );
			} );

			describe( "when the lock is granted", function() {
				var result;
				var response;
				var requestEvent;
				var responseEvent;
				before( function( done ) {

					consul.kv.set.resolves( [ true ] );

					myLocker.lockValue = { myPid: 711 };

					myLocker.strategy.getLock.returns( undefined );

					myLocker.on( "lock.request", function( data ) {
						requestEvent = data;
					} );

					myLocker.on( "lock.response", function( data ) {
						responseEvent = data;
					} );

					result = myLocker._lock( 456 );

					result.then( function( _response ) {
						response = _response;
						done();
					} );

				} );

				after( function() {
					consul.kv.set.reset();
					myLocker.strategy.getLock.reset();
				} );

				it( "should resolve with result", function() {
					response.should.equal( true );
				} );

				it( "should emit a lock request event", function() {
					requestEvent.should.eql( {
						key: "myServiceWriter/456/lock",
						value: result
					} );
				} );

				it( "should emit a lock response event", function() {
					responseEvent.should.eql( {
						key: "myServiceWriter/456/lock",
						value: true
					} );
				} );

				it( "should try to set the proper options", function() {
					consul.kv.set.should.have.been.calledWith( {
						key: "myServiceWriter/456/lock",
						value: JSON.stringify( { myPid: 711 } ),
						acquire: "mysession123"
					} );
				} );
			} );
		} );


	} );

} );