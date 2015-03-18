require( "../setup.js" );
var util = require( "util" );
var async = require( "async" );
var lFactory = require( "../../src/index.js" )();

function Test() {
	this.startTime;
	this.endTime;
	this.results;

	this.avgTime;
	this.totalTime;
	this.throughPut;
}

Test.prototype.start = function() {
	this.startTime = +new Date();
};

Test.prototype.end = function() {
	this.endTime = +new Date();

	this.totalTime = ( this.endTime - this.startTime ) * 1000;
	this.avgTime = _.sum( this.results ) / this.results.length;
	this.throughPut = 1000 / this.avgTime;
};

var CONCURRENCY = 10;
var TASK_COUNT = 10000;
var MAX_ID = 50;

var worker = function( task, callback ) {
	var start = +new Date();
	locker.lock( task.id )
		.then( function( res ) {
			//console.log( res );
			test.results.push( +new Date() - start );
			callback();
		}, function( err ) {
				console.log( "Error: ", err );
				test.results.push( +new Date() - start );
				callback();
			} );
};

var q = async.queue( worker, CONCURRENCY );

q.empty = function() {
	_.defer( function() {
		test.end();
		util.log( "Test ended" );
		util.log( "Number of requests: %s", test.results.length );
		util.log( "Total time: %s s", test.totalTime );
		util.log( "Average request time: %s ms", test.avgTime );
		util.log( "Throughput: %s / s" );
	} );

};

util.log( "Starting benchmark test" );
var locker = lFactory.create( {
	name: "boardWrites",
	strategy: "permanent"
} );
var test = new Test();
test.start();

for (var i = 0; i < TASK_COUNT; i++) {
	q.push( { id: _.random( 0, MAX_ID ) } );
}