require( "../setup.js" );

var Locker;

describe( "Locker FSM", function() {

	before( function() {
		Locker = require( "../../src/Locker.fsm.js" );
	} );

	describe( "when initializing", function() {
		var myLocker;
		before( function() {
			myLocker = new Locker();
		} );

		it( "should get the correct parameters", function() {
			true.should.be.ok;
		} );

	} );
} );