/* globals beforeEach, describe, it */
'use strict';
var _ = require('lodash'),
    util = require('util'),
    should = require('chai').should(),
    Promise = require('bluebird'),
    express = require('express'),
    request = require('supertest-as-promised');

describe('rest-pipeline', function () {
  var pipeline, app;

  beforeEach(function () {
    pipeline = require('./index.js')({
      errorLogger: null,
      traceLogger: null,
      passport: {
        authenticate: function () {
          return function (req, res, next) {
            if (req.headers.authorization === 'test') {
              req.user = {};
            }

            if (req.user) {
              next();
            } else {
              next('No User');
            }
          };
        }
      }
    });

    app = express();
    app.use(pipeline);
  });

  it('should be a function', function () {
    pipeline.should.be.a.Function; // jshint ignore:line
  });

  describe('routes', function () {
    it('should describe route names propertly', function () {
      pipeline.register('test', {
        '/': {
          get: function() {}
        },
        '/blah': {
          get: function () {}
        },
        '/capital': {
          GET: function () {}
        }
      });
      return Promise.all([
        request(app)
        .get('/test/')
        .expect(204),
        request(app)
        .get('/test')
        .expect(204),
        request(app)
        .get('/test/blah')
        .expect(204),
        request(app)
        .get('/test/capital')
        .expect(204),
        request(app)
        .get('/tesst/')
        .expect(404)
      ]);
    });

    it('should append a prefix', function () {
      pipeline.register('test', {
        '/': {
          get: function() {}
        },
        '/blah': {
          get: function () {}
        }
      }, '/dev');
      return Promise.all([
        request(app)
        .get('/dev/test/')
        .expect(204),
        request(app)
        .get('/dev/test')
        .expect(204),
        request(app)
        .get('/dev/test/blah')
        .expect(204)
      ]);
    });

    it('should describe routes on the index', function () {
      pipeline.register({
        '/': {
          get: function() {}
        },
        '/blah': {
          get: function () {}
        }
      });
      return Promise.all([
        request(app)
        .get('/')
        .expect(204),
        request(app)
        .get('/blah')
        .expect(204),
        request(app)
        .get('/abc')
        .expect(404)
      ]);
    });
  });

  describe('function return values', function () {
    it('should respond with 204 when no return value', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
            }
          }
        }
      });
      return request(app)
      .get('/')
      .expect(204);
    });

    describe('returning objects', function () {
      it('should respond with 200 when boolean returned', function () {
        pipeline.register({
          '/': {
            get: {
              authorization: null,
              authentication: null,
              action: function() {
                return true;
              }
            }
          }
        });
        return request(app)
        .get('/')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(function (res) {
          res.body.should.be.true;
        });
      });

      it('should do nothing when skipResponse is returned', function () {
        pipeline.register({
          '/': {
            get: {
              authorization: null,
              authentication: null,
              action: function() {
                return this.skipResponse();
              }
            }
          }
        });
        return Promise.race([
          request(app)
          .get('/')
          .expect(204)
          .then(function () {
            return Promise.reject();
          }),
          new Promise(function (resolve) {
            process.nextTick(resolve);
          })
        ]);
      });

      it('should respond with 200 when object returned', function () {
        pipeline.register({
          '/': {
            get: {
              authorization: null,
              authentication: null,
              action: function() {
                return {};
              }
            }
          }
        });
        return request(app)
        .get('/')
        .expect(200, {})
        .expect('Content-Type', /json/);
      });

      it('should call toJSON if exists', function () {
        pipeline.register({
          '/': {
            get: {
              authorization: null,
              authentication: null,
              action: function() {
                return { toJSON: function () {
                  return 'foo';
                }};
              }
            }
          }
        });
        return request(app)
        .get('/')
        .expect(200, '"foo"') // Is a JSON string.
        .expect('Content-Type', /json/);
      });
    });

    it('should return the status code of 400 when 400 returned', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
              return 400;
            }
          }
        }
      });
      return request(app)
      .get('/')
      .expect(400);
    });

    it('should return a status code and object when Response is returned', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
              return this.response(200, true);
            }
          }
        }
      });

      return request(app)
      .get('/')
      .expect(200, 'true')
      .expect('Content-Type', /json/);
    });

    it('should allow array to be sent', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
              return ['abc', 'def'];
            }
          }
        }
      });
      return request(app)
      .get('/')
      .expect(200, ['abc', 'def'])
      .expect('Content-Type', /json/);
    });

    it('should allow html to be sent', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
              return this.response('html', '<a></a>');
            }
          }
        }
      });
      return request(app)
      .get('/')
      .expect(200, '<a></a>')
      .expect('Content-Type', /html/);
    });

    it('should allow specific MIME type to be sent', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {
              return this.response(200, 'text/calendar', 'blahblah\nblahblah');
            }
          }
        }
      });
      return request(app)
      .get('/')
      .expect(200, 'blahblah\nblahblah')
      .expect('Content-Type', /calendar/);
    });
  });

  describe('authenticate', function () {
    it('should allow anonymous access', function () {
      pipeline.register({
        '/': {
          get: {
            authorization: null,
            authentication: null,
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .expect(204);
    });

    it('should return 401 on no user', function () {
      pipeline.register({
        '/': {
          get: {
            authentication: 'bearer',
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .expect(401);
    });

    it('should succeed when using bearer and user exists', function () {
      pipeline.register({
        '/': {
          get: {
            authentication: 'bearer',
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .set('Authorization', 'test')
      .expect(204);
    });
  });

  describe('authorize', function () {
    it('should allow access when auth function returns promise.', function () {
      pipeline.register({
        '/': {
          get: {
            authentication: 'bearer',
            authorization: function () {
              return Promise.resolve();
            },
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .set('Authorization', 'test')
      .expect(204);
    });

    it('should reject access when auth function returns rejected promise.', function () {
      pipeline.register({
        '/': {
          get: {
            authentication: 'bearer',
            authorization: function () {
              return Promise.reject();
            },
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .set('Authorization', 'test')
      .expect(403);
    });

    it('should reject when false is returned.', function () {
      pipeline.register({
        '/': {
          get: {
            authentication: 'bearer',
            authorization: function () {
              return false;
            },
            action: function() {}
          }
        }
      });
      return request(app)
      .get('/')
      .set('Authorization', 'test')
      .expect(403);
    });
  });

  describe('context', function () {
    it('should have a context', function () {
      pipeline.register({
        '/': {
          get: function() {
            should.exist(this.req);
            should.exist(this.res);
          }
        }
      });
      return request(app)
      .get('/')
      .expect(204);
    });
  });

  describe('swagger', function () {
    var spec = require('swagger-tools').specs.v2,
        sampleController = require('./sample.controller.js');

    beforeEach(function () {
      pipeline.register(sampleController);
    });

    it('should validate the swagger object properly', function () {
      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      });
    });

    it('should have a swagger.json endpoint', function () {
      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      })
      .then(function (swaggerObj) {
        return request(app)
        .get('/swagger.json')
        .expect(200)
        .then(function (res) {
          swaggerObj.should.eql(res.body);
        });
      });
    });

    it('should not have a swagger endpoint when disabled', function () {
      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      })
      .then(function (swaggerObj) {
        return request(app)
        .get('/swagger/')
        .expect(404);
      });
    });

    it('should have a swagger endpoint when enabled', function () {
      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      }, {
        enableUI: true
      })
      .then(function (swaggerObj) {
        return request(app)
        .get('/swagger/')
        .expect(200)
        .expect('Content-Type', /html/);
      });
    });

    it('should have all endpoints listed', function () {
      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      })
      .then(function (swaggerObj) {
        var paths = swaggerObj.paths, 
            routes  = _.keys(sampleController),
            pathList = _.keys(paths);

        routes.length.should.equal(pathList.length);
        _.all(routes, function (item, index) {
          item = item.replace(/:\w*/, function (value) {
            var param = value.substring(1);
            return util.format('{%s}', param);
          });
          return pathList[index] === item;
        }).should.equal(true);
      });
    });

    it('should convert apikey to bearer header', function () {
      pipeline.register('test', {
        '/': {
          get: function () {
            return this.req.headers.authorization;
          }
        }
      });

      return pipeline.swagger({
        title: 'Mocha',
        version: '1.0'
      })
      .then(function (swaggerObj) {
        return request(app)
        .get('/test/')
        .query({api_key: 'abc'})
        .expect(200, '"Bearer abc"');
      });
    });
  });
});