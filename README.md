A framework for creating swagger-enabled REST endpoints.

See sample.controller.js for examples on what the endpoint definitions can look like.

Initialization
==============
````
var reststop = require('expresswayreststop');

reststop = reststop({
  defaultAuthentication: null, // the default authentication to use if undefined in a route.
  defaultAuthorization: null, // The default authorization to use if undefined in a route.
  passport: null, // Passport is required if authentication is a string (The passport auth method to use).
  traceLogger: console.log,
  errorLogger: console.error,
  roleChecker: null // Function called during authorization
});
````


Routes
======
````
{
  action: function (res, res) {
    // If nothing is returned, server will respond with 204.
    // If promise is returned, server will respond with 204 if promise resolves to undefined or JSON if the promise resolves to something else.
    // this contains { req, res, skipResponse, response }
    // return this.skipResponse(); to skip auto responding.
    // return this.response(statusCode, mimeType, body); to customize the response. Omit mimeType to default to JSON.
  }
}
````

Usage
=====

Register routes with ````reststop.register(routeObj);````.
Add to express ````express.use(reststop);````.

Swagger
=======
Enable swagger with
````
reststop.swagger({
  title: '',
  version: ''
},
  enableUI: true, // If true, will host a swagger ui on /swagger/
  basePath: '/' // The base path that swagger.json will be hosted under.
{
});
````

The options object can be omitted.
