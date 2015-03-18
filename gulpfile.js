var gulp = require( "gulp" );
var bg = require( "biggulp" )( gulp );
var jshint = require( "gulp-jshint" );
require( "jshint-stylish" );

gulp.task( "default", [ "continuous-test", "watch" ] );

gulp.task( "test", function() {
	return bg.testOnce( "behavior/**/*.spec.js" );
} );

gulp.task( "int", function() {
	return bg.testOnce( "integration/**/*.spec.js" );
} );

gulp.task( "bench", function() {
	return bg.testOnce( "benchmark/**/*.spec.js" );
} );

gulp.task( "coverage", bg.showCoverage( "behavior/**/*.spec.js" ) );

gulp.task( "continuous-test", bg.withCoverage( "behavior/**/*.spec.js" ) );

gulp.task( "watch", function() {
	return bg.watch( [ "continuous-test" ] );
} );

gulp.task( "lint", function() {
	return gulp.src( [ "./src/**/*.js", "./spec/**/*.js" ] )
		.pipe( jshint() )
		.pipe( jshint.reporter( "jshint-stylish" ) );
} );