// Netlify Function: bungkus aplikasi Express pakai serverless-http
const serverless = require('serverless-http');
const app = require('../../app');

module.exports.handler = serverless(app, { binary: true });
