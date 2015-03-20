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
				name: "myServiceWriter",
				maxRetries: 15,
				retryInterval: 45
			}, consul, strategy );
		} );

		it( "should set the name from options", function() {
			myLocker.sessionName.should.equal( "myServiceWriter" );
		} );

		it( "should set the max retries", function() {
			myLocker.maxRetries.should.equal( 15 );
		} );

		it( "should set the retry interval", function() {
			myLocker.retryInterval.should.equal( 45000 );
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

	describe( "public API", function() {
		var myLocker;

		before( function() {
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

		} );


		describe( "when attempting to lock", function() {
			var handle;
			var request;
			before( function() {
				handle = sinon.stub( myLocker, "handle", function( state, id, deferred ) {
					return deferred.resolve( "got it" );
				} );

				request = myLocker.lock( "someid" );
			} );

			after( function() {
				handle.restore();
			} );

			it( "should resolve with the result", function() {
				request.should.eventually.equal( "got it" );
			} );

			it( "should call handle with the correct arguments", function() {
				handle.should.have.been.calledWith( "lock", "someid" );
			} );

		} );

		describe( "when attempting to release", function() {
			var handle;
			var request;
			before( function() {
				handle = sinon.stub( myLocker, "handle", function( state, id, deferred ) {
					return deferred.resolve( "released" );
				} );

				request = myLocker.release( "someid" );
			} );

			after( function() {
				handle.restore();
			} );

			it( "should resolve with the result", function() {
				request.should.eventually.equal( "released" );
			} );

			it( "should call handle with the correct arguments", function() {
				handle.should.have.been.calledWith( "release", "someid" );
			} );
		} );

		describe( "when starting", function() {
			var t;
			before( function() {
				t = sinon.stub( myLocker, "transition" );
				myLocker.start();
			} );

			after( function() {
				t.restore();
			} );

			it( "should transition to acquiring", function() {
				t.should.have.been.calledWith( "acquiring" );
			} );
		} );

		describe( "when stopping", function() {

			var t;
			var end;
			before( function() {
				t = sinon.stub( myLocker, "transition" );
				end = sinon.stub( myLocker, "_endSession" );
			} );

			after( function() {
				t.restore();
				end.restore();
			} );

			describe( "when session end succeeds", function() {

				before( function() {
					end.reset();
					end.resolves( true );
					myLocker.stop();
				} );

				after( function() {
					end.reset();
				} );

				it( "should transition to stopped", function() {
					t.should.have.been.calledWith( "stopped" );
				} );
			} );

			describe( "when session end fails", function() {
				before( function() {
					end.reset();
					end.rejects( new Error( "I just can't stop" ) );
					myLocker.stop();
				} );

				after( function() {
					end.reset();
				} );

				it( "should transition to stopped", function() {
					t.should.have.been.calledWith( "stopped" );
				} );
			} );
		} );

		describe( "when rebooting", function() {
			var t;
			before( function() {
				t = sinon.stub( myLocker, "transition" );
			} );

			after( function() {
				t.restore();
			} );
			describe( "when reboot tries are remaining", function() {

				var start;

				before( function( done ) {
					start = sinon.stub( myLocker, "start" );
					myLocker.rebootCount = 1;
					myLocker.maxRetries = 5;
					myLocker.retryInterval = 10;
					myLocker.reboot();

					setTimeout( function() {
						done();
					}, 50 );
				} );

				after( function() {
					start.restore();
				} );

				it( "should increment the reboot count", function() {
					myLocker.rebootCount.should.equal( 2 );
				} );

				it( "should call start after the interval is up", function() {
					start.should.have.been.called;
				} );

			} );
			describe( "when reboot limit has been reached", function() {
				var err;
				before( function() {
					err = sinon.stub( console, "error" );
					myLocker.rebootCount = 5;
					myLocker.maxRetries = 5;
					myLocker.reboot();
				} );

				after( function() {
					err.restore();
					t.reset();
				} );

				it( "should transition to stopped", function() {
					t.should.have.been.calledWith( "stopped" );
				} );

				it( "should log an error message", function() {
					err.should.have.been.calledWith( "Retry limit exceeded. Shutting down locker." );
				} );
			} );
		} );
	} );

	describe( "Locker States", function() {
		var myLocker;
		var t;
		var defer;
		before( function() {
			myLocker = new Locker( {
				initialState: "stopped",
				name: "myServiceWriter"
			}, consul, strategy );

			myLocker._transition = myLocker.transition;
			t = sinon.stub( myLocker, "transition" );
			defer = sinon.stub( myLocker, "deferUntilTransition" );
		} );
		describe( "acquiring", function() {
			var start;
			before( function() {
				start = sinon.stub( myLocker, "_startSession" );
			} );

			after( function() {
				start.restore();
			} );

			describe( "when entering", function() {
				describe( "when session starting succeeds", function() {
					before( function( done ) {
						start.resolves( true );
						myLocker.states.acquiring._onEnter.call( myLocker );
						setTimeout( function() {
							done();
						}, 100 );
					} );

					after( function() {
						start.reset();
						t.reset();
					} );

					it( "should transition to ready", function() {
						t.should.have.been.calledWith( "ready" );
					} );
				} );
				describe( "when session starting fails", function() {
					var reboot;
					var expectedError = new Error( "No Starting" );
					var log;
					before( function( done ) {
						log = sinon.stub( console, "error" );
						reboot = sinon.stub( myLocker, "reboot" );
						start.rejects( expectedError );
						myLocker.states.acquiring._onEnter.call( myLocker );
						setTimeout( function() {
							done();
						}, 100 );
					} );

					after( function() {
						start.reset();
						t.reset();
						log.restore();
						reboot.restore();
					} );

					it( "should transition to ready", function() {
						reboot.should.have.been.called;
					} );

					it( "should log the error", function() {
						log.should.have.been.calledWith( "Error acquiring session" );
						log.should.have.been.calledWith( expectedError.toString() );
					} );
				} );
			} );

			describe( "when locking", function() {
				before( function() {
					defer.reset();
					myLocker.states.acquiring.lock.call( myLocker );
				} );

				after( function() {
					defer.reset();
				} );

				it( "should defer until ready", function() {
					defer.should.have.been.calledWith( "ready" );
				} );
			} );

			describe( "when releasing", function() {
				var deferred;
				var promise;
				var eventMsg;
				before( function() {
					deferred = when.defer();
					promise = deferred.promise;

					myLocker.on( "lock.release", function( data ) {
						eventMsg = data;
					} );

					myLocker.states.acquiring.release.call( myLocker, 123, deferred );
				} );

				it( "should resolve to true", function() {
					promise.should.eventually.equal( true );
				} );

				it( "should emit a release event", function() {
					eventMsg.should.eql( {
						key: "myServiceWriter/123/lock"
					} );
				} );
			} );

		} );

		describe( "ready", function() {
			describe( "when entering", function() {
				before( function() {
					myLocker.rebootCount = 5;
					myLocker._transition( "ready" );
				} );

				it( "should reset the reboot count", function() {
					myLocker.rebootCount.should.equal( 0 );
				} );
			} );

			describe( "when locking", function() {
				var lock;
				before( function() {
					myLocker._transition( "ready" );
					lock = sinon.stub( myLocker, "_lock" );
				} );
				describe( "when lock succeeds", function() {
					var deferred;
					var promise;
					before( function() {
						deferred = when.defer();
						promise = deferred.promise;
						lock.reset();
						lock.resolves( true );
						myLocker.states.ready.lock.call( myLocker, 456, deferred );
					} );

					after( function() {
						lock.reset();
					} );

					it( "should resolve with the result", function() {
						promise.should.eventually.equal( true );
					} );

					it( "should call lock with the correct id", function() {
						lock.should.have.been.calledWith( 456 );
					} );

				} );
				describe( "when lock fails", function() {
					var deferred;
					var promise;
					var expectedError = new Error( "no locking" );
					before( function() {
						deferred = when.defer();
						promise = deferred.promise;
						lock.reset();
						lock.rejects( expectedError );
						myLocker.states.ready.lock.call( myLocker, 456, deferred );
					} );

					after( function() {
						lock.reset();
					} );

					it( "should reject with the error", function() {
						promise.should.be.rejectedWith( expectedError );
					} );

					it( "should call lock with the correct id", function() {
						lock.should.have.been.calledWith( 456 );
					} );
				} );
			} );

			describe( "when releasing", function() {
				var release;
				before( function() {
					myLocker._transition( "ready" );
					release = sinon.stub( myLocker, "_release" );
				} );
				describe( "when releasing succeeds", function() {
					var deferred;
					var promise;
					var eventMsg;
					before( function() {
						deferred = when.defer();
						promise = deferred.promise;
						release.reset();
						release.resolves( true );
						myLocker.on( "lock.release", function( data ) {
							eventMsg = data;
						} );
						myLocker.states.ready.release.call( myLocker, 456, deferred );
					} );

					after( function() {
						release.reset();
					} );

					it( "should resolve with the result", function() {
						promise.should.eventually.equal( true );
					} );

					it( "should call lock with the correct id", function() {
						release.should.have.been.calledWith( 456 );
					} );

					it( "should emit a lock release event", function() {
						eventMsg.should.eql( {
							key: "myServiceWriter/456/lock"
						} );
					} );
				} );

				describe( "when releasing fails", function() {
					var deferred;
					var promise;
					var eventMsg;
					var expectedError = new Error( "No Releasing" );
					before( function() {
						deferred = when.defer();
						promise = deferred.promise;
						release.reset();
						release.rejects( expectedError );
						myLocker.on( "lock.release", function( data ) {
							eventMsg = data;
						} );
						myLocker.states.ready.release.call( myLocker, 456, deferred );
					} );

					after( function() {
						release.reset();
					} );

					it( "should reject with the error", function() {
						promise.should.be.rejectedWith( expectedError );
					} );

					it( "should call lock with the correct id", function() {
						release.should.have.been.calledWith( 456 );
					} );

					it( "should emit a lock release event", function() {
						eventMsg.should.eql( {
							key: "myServiceWriter/456/lock"
						} );
					} );
				} );
			} );

		} );

		describe( "paused", function() {
			before( function() {
				myLocker._transition( "paused" );
			} );

			describe( "when locking", function() {
				before( function() {
					defer.reset();
					myLocker.handle( "lock", 123 );
				} );

				it( "should defer until ready", function() {
					defer.should.have.been.calledWith( "ready" );
				} );
			} );

			describe( "when releasing", function() {
				before( function() {
					defer.reset();
					myLocker.handle( "release", 123 );
				} );

				it( "should defer until ready", function() {
					defer.should.have.been.calledWith( "ready" );
				} );
			} );
		} );

		describe( "stopped", function() {
			var stoppedError = new Error( "Locking session has ended" );
			describe( "when entering", function() {
				var end;
				before( function() {
					end = sinon.stub( myLocker, "_endSession" );
					myLocker.sessionId = "heyimasession";
					myLocker.states.stopped._onEnter.call( myLocker );
				} );

				after( function() {
					end.restore();
				} );

				it( "should end the session", function() {
					end.should.have.been.called;
				} );
			} );

			describe( "locking", function() {
				var deferred;
				var promise;
				before( function() {
					deferred = when.defer();
					promise = deferred.promise;
					myLocker._transition( "stopped" );
					myLocker.handle( "lock", "id", deferred );
				} );

				it( "should reject with error", function() {
					promise.should.be.rejectedWith( stoppedError );
				} );
			} );

			describe( "releasing", function() {
				var deferred;
				var promise;
				before( function() {
					deferred = when.defer();
					promise = deferred.promise;
					myLocker._transition( "stopped" );
					myLocker.handle( "release", "id", deferred );
				} );

				it( "should reject with error", function() {
					promise.should.be.rejectedWith( stoppedError );
				} );
			} );
		} );
	} );

} );