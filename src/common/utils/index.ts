import { CookieSerializeOptions } from "@fastify/cookie";
import crypto from "crypto";
import { FastifyReply } from "fastify";
import config from "../config";
import axios from "axios";
import { customAlphabet, nanoid } from "nanoid";

const baiduAccessTokenConfig = {
  token: "",
  nextUpdate: 0
}

export const md5 = (str: string | number) => {
  const hash = crypto.createHash("md5");
  hash.update(Buffer.from(str.toString()));
  return hash.digest("hex");
};

export const sucRes = (data: any, message = "ok") => {
  return {
    code: 0,
    data,
    message,
  };
};

export const errRes = (code: number, message: string) => {
  return {
    code,
    message,
  };
};

export const setCookie = (reply: FastifyReply, key: string, value: string, options: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "none",
}) => {
  reply.setCookie(key, value, options);
};

export const encryptPassword = (password: string) => {
  return md5(md5(password) + "chengfx");
};

/**
 * 检测是否在路由白名单
 * @param path 路由
 * @param whiteList 白名单列表
 * @param ROUTER_PREFIX 路由前缀
 * @returns boolean
 */
export const validateWhiteList = (path: string, whiteList: string[], ROUTER_PREFIX = "") => {
  return whiteList.some((item) => {
    return path === ROUTER_PREFIX + item;
  });
};

/**
 * 百度翻译
 * @param text 
 * @param from 
 * @param to 
 * @returns 
 */
export const translateByBaiDu = async (text: string, from = 'auto', to = 'en') => {
  const url = "https://fanyi-api.baidu.com/api/trans/vip/translate";
  const randomSalt = Math.random() * 10000000 | 0;
  const translateConfig = config.BAIDU.TRANSLATE;
  const rawSign = `${translateConfig.APP_ID}${text}${randomSalt}${translateConfig.APP_SECRET}`;
  const res = await axios.get(url, {
    params: {
      q: text,
      from,
      to,
      appid: translateConfig.APP_ID,
      salt: randomSalt,
      sign: md5(rawSign)
    }
  });
  return res.data.trans_result?.[0].dst || "";
}

/**
 * 获取百度AI接口的token
 * @returns 
 */
export const getBaiduAuthToken = async () => {
  if (Date.now() < baiduAccessTokenConfig.nextUpdate) {
    return baiduAccessTokenConfig.token;
  }
  const url = "https://aip.baidubce.com/oauth/2.0/token";
  const authConfig = config.BAIDU.AI;
  const res = await axios.get(url, {
    params: {
      grant_type: "client_credentials",
      client_id: authConfig.APP_KEY,
      client_secret: authConfig.APP_SECRET
    }
  });
  baiduAccessTokenConfig.token = res.data.access_token;
  baiduAccessTokenConfig.nextUpdate = Date.now() + res.data.expires_in * 1000;
  return baiduAccessTokenConfig.token;
};

/**
 * 百度语义分析
 * @param text 
 */
export const checkTextByBaiDu = async (text: string) => {
  const token = await getBaiduAuthToken();
  const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${token}`;
  const res = await axios.post(url, {
    text
  }, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  if (res.data.conclusionType === 2) {
    return Promise.reject(new Error(res.data.data[0].msg));
  }
  return res.data;
}

/**
 * 批量生成充值码
 * @param count 充值码数量
 */
export const generateRechargeSecret = (count = 10) => {
  const ID_LENGTH = 32;
  const SPLIT_LENGTH = 4;
  const customNanoId = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", ID_LENGTH);
  // 每4个字符加一个-
  const gen = () => {
    let str = [];
    const id = customNanoId().split("");
    for (let i = 0; i < SPLIT_LENGTH; i++) {
      str.push(id.splice(0, ID_LENGTH / SPLIT_LENGTH).join(""));
    }
    return str.join("-");
  }
  return Array.from({ length: count }, gen);
}