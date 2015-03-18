var debug = require( "debug" )( "harness" );
var util = require( "util" );
var EventEmitter = require( "events" ).EventEmitter;
var lFactory = require( "../../src/index.js" )();
var when = require( "when" );
var async = require( "async" );
var hiresTime = require( "hirestime" );

function toMs( hrtime ) {
	return ( hrtime[ 0 ] * 1e9 + hrtime[ 1 ] ) / 1000000;
}

function TestHarness( config ) {
	EventEmitter.call( this );

	this.concurrency = config.concurrency || 1;
	this.expect = config.expect;
	this.taskGenerator = config.taskGenerator.bind( this );

	this.startTime;
	this.endTime;
	this.results = [];

	this.counter = 0;

	this.avgTime;
	this.totalTime;
	this.throughPut;

	this.tasks = [];

	if ( config.init ) {
		config.init.call( this );
	}
}

util.inherits( TestHarness, EventEmitter );

TestHarness.prototype.start = function() {
	this.timer = hiresTime();

	debug( "System Time: %s", +new Date() );
	debug( "Test Start Time: %s", this.startTime );

	this.taskGenerator();

	debug( "%s Tasks Created", this.tasks.length );

	return when.promise( function( resolve, reject ) {
		async.parallelLimit( this.tasks, this.concurrency, function( err ) {
			this.end();
			resolve();
		}.bind( this ) );
	}.bind( this ) );

};

TestHarness.prototype.end = function( results ) {
	debug( "System Time: %s", +new Date() );
	this.totalTime = this.timer( hiresTime.S );

	this.totalThroughPut = this.expect / this.totalTime;
	this.avgTime = _.sum( this.results ) / this.results.length;
	this.avgThroughPut = 1000 / this.avgTime;
	this.emit( "finish" );
};

TestHarness.prototype.wrapTask = function( task ) {

	return function( callback ) {
		var taskTimer = hiresTime();
		return task().then( function() {
			var result = taskTimer( hiresTime.MS );
			debug( "Task Result: %s", result );
			this.results.push( result );
			this.counter++;
			callback();
		}.bind( this ) );
	}.bind( this );

};

TestHarness.prototype.addTask = function( _task ) {
	var task = this.wrapTask.call( this, _task );
	this.tasks.push( task );
};

module.exports = TestHarness;