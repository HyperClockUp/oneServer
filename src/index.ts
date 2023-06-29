import Fastify from 'fastify';
import { bootstrap } from 'fastify-decorators';
import fastifyMysql from '@fastify/mysql';
import fastifyJWT from '@fastify/jwt';
import fastifyRedis from '@fastify/redis';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySecureSession from '@fastify/secure-session';
import fs from 'fs';
import path from 'path';
import config from "@config/index";

const server = Fastify({
  logger: true,
});

// decorate server with fastify-decorators
server.register(bootstrap, {
  directory: new URL('./controllers', import.meta.url),
  mask: /\.controller\./,
})

// register token plugin
server.register(fastifyJWT, {
  secret: config.JWT.secret,
  cookie: {
    cookieName: 'token',
    signed: false
  }
})

// register fastify-mysql
const { mysql } = config.DB;
server.register(fastifyMysql, {
  connectionString: `mysql://${mysql.userName}:${mysql.password}@${mysql.host}/${mysql.database}`,
  promise: true,
})

// register fastify-redis
const { redis } = config.DB;
server.register(fastifyRedis, redis)

// register fastify-cookie
server.register(fastifyCookie)

// register fastify-rate-limit
server.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute'
})

// register fastify-secure-session
server.register(fastifySecureSession, {
  // the name of the attribute decorated on the request-object, defaults to 'session'
  sessionName: 'session',
  // the name of the session cookie, defaults to value of sessionName
  cookieName: 'one-service-session',
  // adapt this to point to the directory where secret-key is located
  key: fs.readFileSync(path.join(__dirname, 'secret-key')),
  cookie: {
    path: '/'
    // options for setCookie, see https://github.com/fastify/fastify-cookie
  }
})

server.listen({
  host: "0.0.0.0",
  port: 3000,
});

export default server;