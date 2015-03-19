require( "../setup.js" );
var async = require( "async" );

describe( "locking integration", function() {
	var LockerFactory;
	var consul;

	before( function( done ) {
		LockerFactory = require( "../../src/index.js" )();
		consul = require( "../../src/consul" )();
		consul.kv.del( { key: "lockingCardWrites/", recurse: true }, function() {
			done();
		} );
	} );

	after( function( done ) {
		consul.kv.del( { key: "lockingCardWrites/", recurse: true }, function() {
			done();
		} );
	} );

	describe( "when acquiring a lock for a key", function() {

		var myLocker;
		var myLocker2;
		var key = 123;
		var results;

		before( function( done ) {
			myLocker = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			myLocker2 = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			when.settle( [
				myLocker.lock( key ),
				myLocker.lock( key ),
				myLocker.lock( key ),
				myLocker2.lock( key ),
				myLocker2.lock( key )
			] )
				.then( function( _results ) {
					results = _results;
					done();
				} );
		} );

		it( "should grant the lock to the first requester", function() {
			results[ 0 ].state.should.equal( "fulfilled" );
			results[ 1 ].state.should.equal( "fulfilled" );
			results[ 2 ].state.should.equal( "fulfilled" );
		} );

		it( "should deny the lock to subsequent requesters", function() {
			results[ 3 ].state.should.equal( "rejected" );
			results[ 4 ].state.should.equal( "rejected" );
		} );

	} );

	describe( "when releasing a lock", function() {
		var myLocker;
		var myLocker2;
		var key = 456;
		var results;


		before( function( done ) {
			this.timeout( 5000 );
			myLocker = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			myLocker2 = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			var taskWrapper = function( promise ) {
				return function( callback ) {
					var result = { state: "" };
					promise()
						.then( function() {
							result.state = "fulfilled";
							callback( null, result );
						}, function( err ) {
								result.state = "rejected";
								callback( null, result );
							} );
				};
			};

			var tasks = [
				myLocker.lock.bind( myLocker, key ),
				myLocker.lock.bind( myLocker, key ),
				myLocker2.lock.bind( myLocker2, key ),
				myLocker.release.bind( myLocker, key ),
				myLocker2.lock.bind( myLocker2, key ),
				myLocker.lock.bind( myLocker, key )
			].map( function( task ) {
				return taskWrapper( task );
			} );

			async.series( tasks, function( err, _results ) {
				results = _results;
				done();
			} );

		} );

		it( "should grant the lock to the correct requesters", function() {
			results[ 0 ].state.should.equal( "fulfilled" );
			results[ 1 ].state.should.equal( "fulfilled" );
			results[ 2 ].state.should.equal( "rejected" );
			results[ 3 ].state.should.equal( "fulfilled" );
			results[ 4 ].state.should.equal( "fulfilled" );
			results[ 5 ].state.should.equal( "rejected" );
		} );

	} );

	describe( "when ending a session", function() {
		var myLocker;
		var myLocker2;
		var key = 789;
		var key2 = 987;
		var results;


		before( function( done ) {
			this.timeout( 5000 );
			myLocker = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			myLocker2 = LockerFactory.create( {
				name: "lockingCardWrites"
			} );

			var taskWrapper = function( promise ) {
				return function( callback ) {
					var result = { state: "" };
					promise()
						.then( function() {
							result.state = "fulfilled";
							callback( null, result );
						}, function( err ) {
								result.state = "rejected";
								callback( null, result );
							} );
				};
			};

			var tasks = [
				myLocker.lock.bind( myLocker, key ),
				myLocker.lock.bind( myLocker, key2 ),
				myLocker2.lock.bind( myLocker2, key ),
				myLocker2.lock.bind( myLocker2, key2 ),
				myLocker.stop.bind( myLocker, key ),
				myLocker2.lock.bind( myLocker2, key ),
				myLocker2.lock.bind( myLocker2, key2 ),
			].map( function( task ) {
				return taskWrapper( task );
			} );

			async.series( tasks, function( err, _results ) {
				results = _results;
				done();
			} );

		} );

		it( "should release all locks for later contenders", function() {
			results[ 0 ].state.should.equal( "fulfilled" );
			results[ 1 ].state.should.equal( "fulfilled" );
			results[ 2 ].state.should.equal( "rejected" );
			results[ 3 ].state.should.equal( "rejected" );
			results[ 4 ].state.should.equal( "fulfilled" );
			results[ 5 ].state.should.equal( "fulfilled" );
			results[ 6 ].state.should.equal( "fulfilled" );
		} );

	} );

} );