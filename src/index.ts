import Fastify from 'fastify';
import { bootstrap } from 'fastify-decorators';
import fastifyMysql from '@fastify/mysql';
import fastifyJWT from '@fastify/jwt';
import fastifyRedis from '@fastify/redis';
import config from "@config/index";

const server = Fastify({
  logger: true,
});

// decorate server with fastify-decorators
server.register(bootstrap, {
  directory: new URL('./controllers', import.meta.url),
  mask: /\.controller\./,
})

server.register(fastifyJWT, {
  secret: config.JWT.secret,
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

server.listen({
  port: 3000,
});