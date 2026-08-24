const config = require('../config/config');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Intelligent Hiring API documentation',
    version: '1.0.0',
    license: {
      name: 'MIT',
      url: 'https://github.com/michael-ciniawsky/postcss-load-config/blob/master/LICENSE',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}/v1`,
    },
  ],
};

module.exports = swaggerDefinition;
