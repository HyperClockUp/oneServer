import Fastify from 'fastify';
import { bootstrap } from 'fastify-decorators';
import fastifyMysql from '@fastify/mysql';
import fastifyJWT from '@fastify/jwt';
import fastifyRedis from '@fastify/redis';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
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
server.listen({
  port: 3000,
});