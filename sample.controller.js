'use strict';

module.exports = {
  '/': {
    get: {
      authorization: 'anonymous',
      authentication: null,
      responses: {
        '200': {
          description: 'A successful GET on root'
        }
      },
      action: function () {
        
      }
    },
    POST: {
      responses: {
        '200': {
          description: 'A successful POST on root'
        }
      },
      action: function () {
        
      }
    }
  },
};