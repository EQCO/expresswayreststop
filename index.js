'use strict';
var _ = require('lodash'),
    Promise = require('bluebird'),
    express = require('express');

module.exports = function (options) {
  options = _.defaults(options || {}, {
    defaultAuth: 'bearer',
    passport: null,
    sequelize: null,
    traceLogger: console.log,
    errorLogger: console.error,
    roleChecker: function () {
      return true;
    }
  });

  var router = express.Router();

  var validationError,
      routeCache = {};

  // If null, blackhole it.
  if (_.isNull(options.traceLogger)) {
    options.traceLogger = function () {};
  }

  // If null, blackhole it.
  if (_.isNull(options.errorLogger)) {
    options.errorLogger = function () {};
  }

  if (options.sequelize) {
    validationError = options.sequelize.ValidationError;
  } else {
    validationError = function () {
      return false;
    };
  }

  function authenticate(req, res, authMethod) {
    return new Promise(function (resolve, reject) {
      if (_.isNull(authMethod)) { // Null is no authentication at all.
        resolve();
      } else if (_.isFunction(authMethod)) {
        Promise.method(authMethod)(req)
        .then(function (result) {
          if (_.isUndefined(result) || (_.isBoolean(result) && result)) {
            resolve();
          } else {
            reject();
          }
        })
        .catch(reject);
      } else { // Use passport authentication.
        if (!_.isNull(options.passport)) {
          options.passport.authenticate(authMethod || options.defaultAuth, { session: false })(req, res, function (err) {
            if (err) {
              reject();
            } else {
              resolve();
            }
          });
        } else {
          reject();
        }
      }
    })
    .catch(function () {
      return Promise.reject(401);
    });
  }

  function authorize (req, authMethod) {
    return new Promise(function (resolve, reject) {
      if (_.isUndefined(authMethod)) { // The default authorize is checking to see if a user exists.
        if (_.isObject(req.user)) {
          resolve();
        } else {
          reject();
        }
      } else {
        if (_.isFunction(authMethod)) {
          Promise.method(authMethod)(req)
          .then(function (result) {
            if (_.isUndefined(result) || (_.isBoolean(result) && result)) {
              resolve();
            } else {
              reject();
            }
          })
          .catch(reject);
        } else if (_.isNull(authMethod)) {
          resolve();
        } else { // Otherwise the auth function is a predefined role or array of auth options.
          if (_.isArray(authMethod)) {
            var passed,
                authCount = authMethod.length,
                failCount = 0;
            var asyncPass = function (innerPass) {
              if (!passed) {
                if (innerPass) {
                  passed = true;
                  resolve();
                } else {
                  failCount++;
                  if (failCount === authCount) {
                    reject();
                  }
                }
              }
            };

            _.some(authMethod, function (auth) {
              if (_.isFunction(auth)) {
                auth(req, asyncPass);
              } else {
                asyncPass(_.isObject(req.user) && options.roleChecker(req.user, auth));
              }
            });
          } else {
            if (_.isObject(req.user) && options.roleChecker(req.user, authMethod)) {
              resolve();
            } else {
              reject();
            }
          }
        }
      }
    })
    .catch(function () {
      return Promise.reject(403);
    });
  }

  function executeRoute (req, res, next, routeDef) {
    var context = {
      req: req,
      res: res
    };
    // Make sure the routeDef actually exists, could be a 404.
    if (_.isObject(routeDef) || _.isFunction(routeDef)) {
      return authenticate(req, res, routeDef.authentication)
      .then(function () {
        return authorize(req, routeDef.authorization);
      })
      .then(function () {
        var route = _.isFunction(routeDef) ? routeDef : routeDef.action;
        return Promise.method(route).call(context, req, res)
        .then(function (result) {
          if (!_.isBoolean(result) || result) {
            if (_.isUndefined(result)) {
              if (!res.headersSent) {
                res.status(204).end();
              }
            } else if (_.isNumber(result)) {
              res.status(result).end();
            } else if (_.isArray(result) && _.includes([2, 3], result.length) && _.isNumber(result[0])) {
              if (result.length === 2) {
                res.status(result[0]).json(_.has(result[1], 'toJSON') ? result[1].toJSON() : result[1]);
              } else { // result.length === 3
                res.status(result[0]).type(result[1]).send(result[2]);
              }
            } else {
              res.status(200).json(_.has(result, 'toJSON') ? result.toJSON() : result);
            }
          }
        });
      })
      .catch(validationError, function (error) {
        return res.status(400).json({ validationErrors: error.errors });
      })
      .catch(function (code) {
        if (code === 401) {
          options.traceLogger('authentication failed');
          res.status(401).end();
        } else if (code === 403) {
          options.traceLogger('authorization failed');
          res.status(403).end();
        } else {
          options.errorLogger(code);
          res.status(500).end();
        }
      });
    } else {
      res.status(404).end();
      return Promise.resolve();
    }
  }

  var register = function (controllerName, controllerDefinition, prefix) {
    if (_.isObject(controllerName)) {
      controllerDefinition = controllerName;
      controllerName = null;
    }

    prefix = prefix || '';
    var controllerPrefix = _.isNull(controllerName) ? '' : prefix + '/' + controllerName;
    routeCache[controllerPrefix] = controllerDefinition;

    _.each(_.keys(controllerDefinition), function (route) {
      var chain = router.route(controllerPrefix + (route === '/' ? '' : route));

      if (controllerDefinition[route].get) {
        chain = chain.get(function (req, res, next) {
          options.traceLogger('Hit GET handler for %s on %s', route, controllerName);
          return executeRoute(req, res, next, controllerDefinition[route].get);
        });
      }
      
      if (controllerDefinition[route].put) {
        chain = chain.put(function (req, res, next) {
          options.traceLogger('Hit PUT handler for %s on %s', route, controllerName);
          if (route === '/') {
          // Explicitly disallow PUTs on the index route.
            res.responder(404);
          } else {
            return executeRoute(req, res, next, controllerDefinition[route].put);
          }
        });
      }

      if (controllerDefinition[route].post) {
        chain = chain.post(function (req, res, next) {
          options.traceLogger('Hit POST handler for %s on %s', route, controllerName);
          executeRoute(req, res, next, controllerDefinition[route].post);
        });
      }
      
      if (controllerDefinition[route].delete) {
        chain = chain.delete(function (req, res, next) {
          options.traceLogger('Hit DELETE handler for %s on %s', route, controllerName);
          if (route === '/') {
          // Explicitly disallow DELETEs on the index route.
            res.responder(404);
          } else {
            return executeRoute(req, res, next, controllerDefinition[route].delete);
          }
        });
      }
    });
  };

  var swagger = function (info, options) {
    options = _.defaults(options || {}, {
      enableUI: false
    });

    return new Promise(function (resolve, reject) {
      var swagger = require('swagger-tools');
      var swaggerObject = {
        swagger: '2.0',
        info: info,
        paths: {}
      };

      _.each(routeCache, function (routeDef, controllerName) {
        _.each(routeDef, function (methods, routeName) {
          swaggerObject.paths[controllerName + routeName] = _.mapValues(methods, function (method) {
            var operationObj = {
              summary: method.summary,
              description: method.description,
              responses: method.responses
            };

            return _.omit(operationObj, _.isUndefined);
          });
        })
      });

      swagger.specs.v2.validate(swaggerObject, function (err, result) {
        if (err || result) {
          reject(result.errors);
        } else {
          swagger.initializeMiddleware(swaggerObject, function (middleware) {
            if (options.enableUI) {
              router.use(middleware.swaggerUi({
                apiDocs: '/swagger.json',
                swaggerUi: '/swagger'
              }));
            } else {
              router.route('/swagger.json')
              .get(function (req, res) {
                res.status(200).json(swaggerObject);
              });
            }
            resolve(swaggerObject);
          });
        }
      });
    });
  };

  router.register = register;
  router.swagger = swagger;
  return router;
};