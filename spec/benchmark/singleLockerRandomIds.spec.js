require( "../setup.js" );
var util = require( "util" );
var Harness = require( "./harness.js" );
var lFactory = require( "../../src/index.js" )();
var consul = require( "../../src/consul" )();


describe( "when using all unique ids", function() {
	var test;
	var results;
	var myLocker;
	var TASK_COUNT = 10000;
	var CONCURRENCY = 10;

	beforeEach( function( done ) {
		this.timeout( 20000 );
		consul.kv.del( { key: "randomWrites/", recurse: true }, function() {
			done();
		} );
	} );

	before( function( done ) {
		this.timeout( 20000 );

		myLocker = lFactory.create( {
			name: "randomWrites"
		} );

		var init = function() {
			this.successCounter = 0;
			this.failCounter = 0;
		};

		var taskGenerator = function() {
			for (var i = 0; i < TASK_COUNT; i++) {
				this.queue.push( { id: _.random( 100 ) } );
			}
		};

		var taskHandler = function( task, callback ) {
			var onSuccess = function( res ) {
				this.successCounter++;
				callback();
			}.bind( this );

			var onFail = function() {
				this.failCounter++;
				callback();
			}.bind( this );

			myLocker.lock( task.id ).then( onSuccess, onFail );
		};

		test = new Harness( {
			concurrency: CONCURRENCY,
			expect: TASK_COUNT,
			init: init,
			taskGenerator: taskGenerator,
			taskHandler: taskHandler
		} );

		test.on( "finish", function() {
			done();
		} );

		test.start();

	} );

	after( function( done ) {
		consul.kv.del( { key: "randomWrites/", recurse: true }, function() {
			done();
		} );
	} );

	it( "should complete successfully", function() {
		this.timeout( 20000 );
		test.successCounter.should.equal( TASK_COUNT );
		test.failCounter.should.equal( 0 );

		util.log( "Test ended" );
		util.log( "Number of requests: %s", test.results.length );
		util.log( "Concurrency: %s", CONCURRENCY );
		util.log( "Total time: %s s", test.totalTime / 1000 );
		util.log( "Average request time: %s ms", test.avgTime );
		util.log( "Average throughput: %s/s", Math.floor( test.avgThroughPut ) );
		util.log( "Actual throughput: %s/s", Math.floor( test.totalThroughPut * 1000 ) );
	} );

} );