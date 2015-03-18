require( "../setup.js" );

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
				myLocker.lock( 123 ),
				myLocker.lock( 123 ),
				myLocker.lock( 123 ),
				myLocker2.lock( 123 ),
				myLocker2.lock( 123 )
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

} );