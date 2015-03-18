var gulp = require( "gulp" );
var bg = require( "biggulp" )( gulp );
var jshint = require( "gulp-jshint" );
require( "jshint-stylish" );

gulp.task( "default", [ "continuous-test", "watch" ] );

gulp.task( "test", function() {
	return bg.testOnce();
} );

gulp.task( "int", function() {
	return bg.testOnce( "integration/**/*.spec.js" );
} );

gulp.task( "coverage", bg.showCoverage() );

gulp.task( "continuous-test", bg.withCoverage() );

gulp.task( "watch", function() {
	return bg.watch( [ "continuous-test" ] );
} );

gulp.task( "lint", function() {
	return gulp.src( [ "./src/**/*.js", "./spec/**/*.js" ] )
		.pipe( jshint() )
		.pipe( jshint.reporter( "jshint-stylish" ) );
} );