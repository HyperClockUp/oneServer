import { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
  Controller,
  ErrorHandler,
  FastifyInstanceToken,
  GET,
  Hook,
  Inject,
  POST,
} from "fastify-decorators";
import { FastifyRequestError } from "@/types/global";
import {
  encryptPassword,
  errRes,
  md5,
  setCookie,
  sucRes,
  validateWhiteList,
} from "@utils/index";
import fetch from "@/common/fetch/index";
import config from "@/common/config";
import { WeChatAssociateParams, WeChatLoginParams } from "./wechat.type";
import WeChatTips from "./wechat.tip";
import WechatUser from "@/types/models/WechatUser";
import User from "@/types/models/User";
import UserTips from "../user/user.tip";

const WECHAT_MINIPROGRAM_ACCESS_TOKEN = "oneServerToken";

const miniConfig = config.MINIPROGRAM;

const ROUTER_PREFIX = "/wechat";

const whiteList = ["/login", "/associate"];
@Controller({ route: ROUTER_PREFIX })
export default class WeChatController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  /**
   * 获取小程序 access_token
   */
  async fetchAccessToken() {
    try {
      const res = await fetch.get("/cgi-bin/token", {
        params: {
          grant_type: "client_credential",
          appid: miniConfig.APP_ID,
          secret: miniConfig.APP_SECRET,
        },
      });
      const { access_token, expires_in } = res.data;
      this.instance.redis.set(
        WECHAT_MINIPROGRAM_ACCESS_TOKEN,
        access_token,
        "EX",
        expires_in
      );
    } catch (err) {
      return Promise.reject(WeChatTips.QUERY_ACCESS_TOKEN_ERROR);
    }
    return this.instance.redis.get(WECHAT_MINIPROGRAM_ACCESS_TOKEN);
  }

  @POST({
    url: "/associate",
    options: {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
  })
  async associateHandler(
    request: FastifyRequest<{
      Body: WeChatAssociateParams;
    }>,
    reply: FastifyReply
  ) {
    try {
      const jwt = this.instance.jwt.decode(
        request.headers.authorization!
      ) as any;
      const { account, password, captcha } = request.body;
      const sessionCaptcha = request.session.get("captcha");
      console.log(captcha, sessionCaptcha);
      if (captcha.toLowerCase() !== sessionCaptcha?.toLowerCase()) {
        return errRes(400, WeChatTips.VERIFY_CAPTCHA_ERROR);
      }
      const existUser = await this.instance.prisma.user.findUnique({
        where: {
          account,
          password: encryptPassword(password),
        },
      });
      if (!existUser) {
        return errRes(400, WeChatTips.NOT_FOUND_USER);
      }
      const { openid } = jwt;
      const existWechatUser = await this.instance.prisma.wechat_user.findFirst({
        where: {
          openid,
        },
      });
      if (existWechatUser) {
        return errRes(400, WeChatTips.ALREADY_ASSOCIATED);
      }
      await this.instance.prisma.wechat_user.create({
        data: {
          openid,
          account: existUser.account,
        },
      });
      const token = this.instance.jwt.sign({
        openid,
        account: existUser.account,
      });
      setCookie(reply, "token", token);
      return sucRes(
        {
          openid,
          account,
        },
        WeChatTips.ASSOCIATED_SUCCESS
      );
    } catch (e) {
      console.log(e);
      return Promise.reject(WeChatTips.ASSOCIATE_ERROR);
    }
  }

  @POST({ url: "/unAssociate" })
  async unAssociateHandler(request: FastifyRequest, reply: FastifyReply) {
    const jwt = this.instance.jwt.decode(request.headers.authorization!) as any;
    const { openid } = jwt;
    await this.instance.prisma.wechat_user.delete({
      where: {
        openid,
      },
    });
    return sucRes(null, WeChatTips.UN_ASSOCIATED_SUCCESS);
  }

  @POST({ url: "/login" })
  async loginHandler(
    request: FastifyRequest<{
      Body: WeChatLoginParams;
    }>,
    reply: FastifyReply
  ) {
    const { js_code } = request.body;
    try {
      const res = await fetch.get("/sns/jscode2session", {
        params: {
          appid: miniConfig.APP_ID,
          secret: miniConfig.APP_SECRET,
          js_code,
          grant_type: "authorization_code",
        },
      });
      const { openid, session_key } = res.data;
      const existUser = await this.instance.prisma.wechat_user.findUnique({
        where: {
          openid,
        },
      });
      if (!existUser) {
        const token = this.instance.jwt.sign({
          openid,
        });
        setCookie(reply, "token", token);
        return sucRes(
          {
            openid,
            associated: false,
          },
          WeChatTips.WECHAT_NOT_ASSOCIATED
        );
      } else {
        const token = this.instance.jwt.sign({
          openid,
        });
        const curUserId = existUser.account;
        const curUser = await this.instance.prisma.user.findUnique({
          where: {
            account: curUserId,
          },
        });
        if (!curUser) {
          return errRes(400, WeChatTips.NOT_FOUND_USER);
        }
        delete (curUser as any).password;
        setCookie(reply, "token", token);
        return sucRes(
          {
            openid,
            associated: true,
            user: curUser,
          },
          WeChatTips.LOGIN_SUCCESS
        );
      }
    } catch (err) {
      console.log(err);
      return errRes(400, WeChatTips.LOGIN_ERROR);
    }
  }

  @GET({ url: "/notice" })
  async noticeHandler(request: FastifyRequest, reply: FastifyReply) {
    return sucRes({
      notice: "欢迎分享使用！",
    });
  }

  @GET({ url: "/godQuestion" })
  async godQuestionHandler(request: FastifyRequest, reply: FastifyReply) {
    return sucRes({
      question: "神谕",
    });
  }

  @POST({ url: "/godAnswer" })
  async godAnswerHandler(
    request: FastifyRequest<{
      Body: {
        answer: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { answer } = request.body;
    const ANSWER = "10086";
    if (answer.toString().toLocaleUpperCase() === ANSWER.toLocaleUpperCase()) {
      return sucRes(WeChatTips.GOD_MODE_ANSWER_SUCCESS);
    }
    return errRes(403, WeChatTips.GOD_MODE_ANSWER_ERROR);
  }

  @Hook("onRequest")
  async onRequestHandler(request: FastifyRequest, reply: FastifyReply) {
    console.log("onRequest", request.url);
    if (validateWhiteList(request.url, whiteList, ROUTER_PREFIX)) {
      return;
    }
    const token = request.headers["authorization"];
    if (!token) {
      reply.code(401).send(errRes(401, UserTips.USER_NOT_LOGIN));
      return;
    }
    try {
      this.instance.jwt.verify(token);
    } catch (err) {
      console.error(err);
      reply.code(401).send(errRes(401, UserTips.USER_NOT_LOGIN));
    }
  }

  @ErrorHandler()
  async handleQueryUserError(
    error: FastifyRequestError,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    console.log(error);
    reply.send({
      code: 500,
      message: error.message,
    });
  }
}
