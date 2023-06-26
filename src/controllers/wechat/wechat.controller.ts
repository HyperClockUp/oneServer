import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject, POST } from 'fastify-decorators';
import { FastifyRequestError } from '@/types/global';
import { errRes, md5, sucRes } from '@utils/index';
import fetch from '@/common/fetch/index';
import config from '@/common/config';
import WeChatError from './wechat.error';
import { WeChatLoginParams } from './wechat.type';

const WECHAT_MINIPROGRAM_ACCESS_TOKEN = 'oneServerToken';

const miniConfig = config.MINIPROGRAM;

@Controller({ route: '/wechat' })
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
      return sucRes(res.data);
    } catch (err) {
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

  }

  @ErrorHandler()
  async handleQueryUserError(error: FastifyRequestError, request: FastifyRequest, reply: FastifyReply) {
    console.error(error);
    reply.send({
      code: 500,
      message: error.err.message,
    })
  }
}


