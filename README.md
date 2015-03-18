# consul-locker

This library uses [Consul](https://consul.io/) sessions to implement distributed locking. It uses [Leader Election](https://consul.io/docs/guides/leader-election.html) to give out locks one at a time.

## Usage

Simple example:

```javascript
var locker = require( "consul-locker" )();

var myLocker = locker.create({
	name: "resourceWriter"
});

myLocker.lock( 123 )
	.then( function() {
		// YAY! You got a lock
		db.writeSomethingAwesome({ id: 123 });
	}, function( err ) {
		// Sorry, no lock for you. Please don't write anything
		abort();
	});
```

Competing lockers:

```javascript

var locker1 = locker.create({
	name: "resourceWriter"
});

var locker2 = locker.create({
	name: "resourceWriter" // Lockers contending for the same keyspace, need to have the same name
});

locker1.lock( "someid" )
	.then( function() {
		// Lock acquired.
	});

// ... Later on

locker2.lock( "someid" )
	.then( null, function( err ) {
		// Lock could not be acquired
		console.log( err ); // Already locked
	});
```

Releasing a lock:

```javascript
locker1.release( "someid" )
	.then( function() {
		// Now it can be acquired by a different locker
	});
```

## API

### Locker Factory

The factory function returned when the module is required accepts a configuration object that is passed into the [consul library](https://github.com/silas/node-consul) used internally. From their documentation, it supports:

* `host` (String, default: 127.0.0.1): agent address
* `port` (String, default: 8500): agent HTTP(S) port
* `secure` (Boolean, default: false): enable HTTPS
* `ca` (String[], optional): array of strings or Buffers of trusted certificates in PEM format

Example:

```javascript
var lockerFactory = require( "consul-locker" )({
	host: "otherhost.com"
});
```

The locker factory returns an object with a single method;

| Method 				| Description |
| ---------------------	| ----------- |
| `create([config])`	| Creates a new locker instance |

Available configuration options:

* `name`: (String) The name of the session. Used as the key prefix for generating lock keys.

**IMPORTANT:** *The `name` property is used to create keys for locking. Therefore, if you want lockers to compete in the same keyspace, you'll have to name them the same thing. Otherwise, they will all compete in their own keyspace which means they will always win their locks and you will lose.*

Example:

```javascript
var myLocker = lockerFactory.create({
	name: "userTableWriter"
});
```

### Locker Object

| Method 			| Description |
| ------------------| ----------- |
| `create( id )`	| Attempts to acquire the lock from Consul |
| `release( id )`	| Releases the lock in Consul |

## How it works

If you've made it this far, you're probably wondering how this library implements leader election. Here is what happens when the library is used:

*Step 1:*

```javascript
var lockerFactory = require( "consul-locker" )();
```

An instance of `node-consul` is created with the given connection information.

*Step 2:*

```javascript
var myLocker = lockerFactory.create({
	name: "writerService"
});
```
A new instance of the `Locker` state machine is created and returned. It immediately begins trying to create a `session` on the consul agent while buffering any attempts to lock until after the `session` is established.

The returned `session` ID is stored internally and used as part of every lock acquisition request.

*Step 3:*

```javascript
myLocker.lock( "someid" )
	.then(function() {
		// Start writing
	})
```

A request is made to consul to set a key called `/writerService/someid/lock?acquire=SESSION_ID`. Consul will return true if the key can be set and false if it cannot. If it cannot, then it has been locked by another session. The locker will resolve or reject the `lock` call depending on the result of this call.

`consul-locker` assumes that locks will be long lived and will caches acquired locks so that additional requests do not need to be made.