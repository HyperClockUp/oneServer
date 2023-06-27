import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject, POST } from 'fastify-decorators';
import { FastifyRequestError } from '@/types/global';
import { encryptPassword, errRes, md5, setCookie, sucRes } from '@utils/index';
import fetch from '@/common/fetch/index';
import config from '@/common/config';
import WeChatError from './wechat.error';
import { WeChatAssociateParams, WeChatLoginParams } from './wechat.type';
import WechatTips from './wechat.tip';
import WechatUser from '@/types/models/WechatUser';
import User from '@/types/models/User';

const WECHAT_MINIPROGRAM_ACCESS_TOKEN = 'oneServerToken';

const miniConfig = config.MINIPROGRAM;

const ROUTER_PREFIX = '/wechat';

const whiteList = ['/login', '/associate'];
@Controller({ route: ROUTER_PREFIX })
export default class WeChatController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance

  /**
   * 获取小程序 access_token
   */
  async fetchAccessToken() {
    try {
      const res = await fetch.get('/cgi-bin/token', {
        params: {
          grant_type: 'client_credential',
          appid: miniConfig.APP_ID,
          secret: miniConfig.APP_SECRET,
        }
      });
      const { access_token, expires_in } = res.data;
      this.instance.redis.set(WECHAT_MINIPROGRAM_ACCESS_TOKEN, access_token, 'EX', expires_in);
    } catch (err) {
      return Promise.reject(WeChatError.QUERY_ACCESS_TOKEN_ERROR);
    }
    return this.instance.redis.get(WECHAT_MINIPROGRAM_ACCESS_TOKEN);
  }

  @POST({
    url: '/associate', options: {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: '1 minute'
        }
      }
    }
  })
  async associateHandler(request: FastifyRequest<{
    Body: WeChatAssociateParams
  }>, reply: FastifyReply) {
    try {
      const jwt = this.instance.jwt.decode(request.headers.authorization!) as any;
      const { account, password } = request.body;
      const sqlInstance = await this.instance.mysql.getConnection();
      const sqlRes = await sqlInstance.query('SELECT * FROM `user` WHERE `account` = ? and `password` = ?', [account, encryptPassword(password)]);
      const existUser = sqlRes[0] as User[];
      if (!existUser.length) {
        return errRes(400, WeChatError.NOT_FOUND_USER);
      }
      const curUser = existUser[0];
      const { openid } = jwt;
      const sqlRes2 = await sqlInstance.query('SELECT * FROM `wechat_user` WHERE `openid` = ?', [openid]);
      const existWechatUser = sqlRes2[0] as WechatUser[];
      if (existWechatUser.length) {
        return errRes(400, WeChatError.ALREADY_ASSOCIATED);
      }
      await sqlInstance.query('INSERT INTO `wechat_user` (`openid`, `account`) VALUES (?, ?)', [openid, curUser.account]);
      const token = this.instance.jwt.sign({
        openid,
        account: curUser.account,
      });
      setCookie(reply, 'token', token);
      return sucRes({
        openid,
        account,
      }, WechatTips.ASSOCIATED_SUCCESS);
    } catch (e) {
      console.log(e);
      return Promise.reject(WeChatError.ASSOCIATE_ERROR);
    }
  }


  @POST({ url: '/login' })
  async loginHandler(request: FastifyRequest<{
    Body: WeChatLoginParams
  }>, reply: FastifyReply) {
    const { js_code } = request.body;
    try {
      const res = await fetch.get('/sns/jscode2session', {
        params: {
          appid: miniConfig.APP_ID,
          secret: miniConfig.APP_SECRET,
          js_code,
          grant_type: 'authorization_code',
        }
      });
      const { openid, session_key } = res.data;
      const sqlInstance = await this.instance.mysql.getConnection();
      const sqlRes = await sqlInstance.query('SELECT * FROM `wechat_user` WHERE `openid` = ?', [openid]);
      const existUser = sqlRes[0] as WechatUser[];
      if (!existUser.length) {
        const token = this.instance.jwt.sign({
          openid,
        });
        setCookie(reply, 'token', token);
        return sucRes({
          openid,
          associated: false,
        }, WechatTips.WECHAT_NOT_ASSOCIATED);
      } else {
        const token = this.instance.jwt.sign({
          openid,
        });
        const curUserId = existUser[0].account;
        const sqlRes2 = await sqlInstance.query('SELECT * FROM `user` WHERE `account` = ?', [curUserId]);
        const curUser = (sqlRes2[0] as User[])[0];
        delete (curUser as any).password;
        setCookie(reply, 'token', token);
        return sucRes({
          openid,
          associated: true,
          user: curUser,
        }, WechatTips.LOGIN_SUCCESS);
      }
    } catch (err) {
      console.log(err);
      return errRes(400, WeChatError.LOGIN_ERROR);
    }
  }

  @POST({ url: '/setRedis' })
  async setRedisHandler(request: FastifyRequest<{
    Body: any
  }>, reply: FastifyReply) {
    const body = request.body;
    this.instance.redis.set('test', JSON.stringify(body));
    return sucRes(body);
  }

  @GET({ url: '/getRedis' })
  async getRedisHandler(request: FastifyRequest, reply: FastifyReply) {
    const data = await this.instance.redis.get('test');
    return sucRes(JSON.parse(data || ""));
  }

  @Hook('onRequest')
  async onRequestHandler(request: FastifyRequest, reply: FastifyReply) {
    if (!whiteList.includes(request.url)) {
      if (!request.headers.authorization) {
        return errRes(400, WeChatError.NOT_FOUND_OPENID);
      }
      try {
        this.instance.jwt.verify(request.headers.authorization);
      } catch (e) {
        return errRes(400, WeChatError.AUTH_ERROR);
      }
    }
  }

  @ErrorHandler()
  async handleQueryUserError(error: FastifyRequestError, request: FastifyRequest, reply: FastifyReply) {
    console.log(error);
    reply.send({
      code: 500,
      message: error.message,
    })
  }
}


