import { CookieSerializeOptions } from "@fastify/cookie";
import { FastifyReply } from "fastify";

export const md5 = (str: string | number) => {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(Buffer.from(str.toString()));
  return hash.digest('hex');
}

export const sucRes = (data: any, message = 'ok') => {
  return {
    code: 0,
    data,
    message,
  }
}

export const errRes = (code: number, message: string) => {
  return {
    code,
    message,
  }
}

export const setCookie = (reply: FastifyReply, key: string, value: string, options: CookieSerializeOptions = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'none',
}) => {
  reply.setCookie(key, value, options);
};

export const encryptPassword = (password: string) => {
  return md5(md5(password) + 'chengfx');
}

/**
 * 检测是否在路由白名单
 * @param path 路由
 * @param whiteList 白名单列表
 * @param ROUTER_PREFIX 路由前缀
 * @returns boolean
 */
export const validateWhiteList = (path: string, whiteList: string[], ROUTER_PREFIX = '') => {
  return whiteList.some((item) => {
    return path === ROUTER_PREFIX + item;
  })
}