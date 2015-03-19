require( "../../setup.js" );

var EventEmitter = require( "events" ).EventEmitter;
var strategyFactory;
var locker;

describe( "permanent caching strategy", function() {

	before( function() {
		locker = new EventEmitter();
		strategyFactory = require( "../../../src/strategies/permanent.js" );
	} );

	describe( "when initializing", function() {
		var s;
		before( function() {
			s = strategyFactory( locker );
		} );

		it( "should create the cache object", function() {
			s._cache.should.eql( {} );
		} );
	} );

	describe( "when a request is made for a lock", function() {
		var s;
		before( function() {
			s = strategyFactory( locker );
			locker.emit( "lock.request", { key: "somekey", value: "somevalue" } );
		} );

		it( "should store the lock value internally", function() {
			s._cache.should.eql( {
				somekey: "somevalue"
			} );
		} );
	} );

	describe( "when a lock response is received", function() {
		var s;
		before( function() {
			s = strategyFactory( locker );
			locker.emit( "lock.request", { key: "otherkey", value: "othervalue" } );
		} );

		it( "should store the lock value internally", function() {
			s._cache.should.eql( {
				otherkey: "othervalue"
			} );
		} );
	} );

	describe( "when a lock is released", function() {
		var s;
		before( function() {
			s = strategyFactory( locker );
			s._cache = {
				key1: true,
				key2: true
			};

			locker.emit( "lock.release", { key: "key1" } );
		} );

		it( "should remove the lock from cache", function() {
			s._cache.should.eql( {
				key2: true
			} );
		} );
	} );

	describe( "when a session ends", function() {
		var s;
		before( function() {
			s = strategyFactory( locker );
			s._cache = {
				key1: true,
				key2: true
			};

			locker.emit( "session.end" );
		} );

		it( "should remove all locks from cache", function() {
			s._cache.should.be.empty;
		} );
	} );

	describe( "when a lock is retrieved", function() {
		describe( "when the value is true", function() {
			var result;
			before( function() {
				var s = strategyFactory( locker );
				s._cache = {
					key1: true,
					key2: false
				};

				result = s.getLock( "key1" );
			} );

			it( "should retrieve the item from cache", function() {
				result.should.eventually.equal( true );
			} );
		} );

		describe( "when the value is a promise", function() {
			var result;
			before( function() {
				var s = strategyFactory( locker );
				s._cache = {
					key1: true,
					key2: when( "somevalue" )
				};

				result = s.getLock( "key2" );
			} );

			it( "should retrieve the item from cache", function() {
				result.should.eventually.equal( "somevalue" );
			} );
		} );

		describe( "when the value is not found", function() {
			var result;
			before( function() {
				var s = strategyFactory( locker );
				s._cache = {
					key1: true,
					key2: when( "somevalue" )
				};

				result = s.getLock( "key3" );
			} );

			it( "should return undefined", function() {
				should.not.exist( result );
			} );
		} );
	} );

} );