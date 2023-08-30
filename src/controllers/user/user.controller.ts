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
import { LoginUserParams, RegisterUserParams } from "./user.type";
import UserTips from "./user.tip";
import {
  encryptPassword,
  errRes,
  md5,
  setCookie,
  sucRes,
  validateWhiteList,
} from "@utils/index";

const whiteList = ["/login", "/register", "/verifyToken"];

const ROUTER_PREFIX = "/user";

@Controller({ route: ROUTER_PREFIX })
export default class UserController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  // 登录
  @POST({
    url: "/login",
    options: {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
  })
  async loginHandler(
    request: FastifyRequest<{
      Body: LoginUserParams;
    }>,
    reply: FastifyReply
  ) {
    if (!request.body) {
      return errRes(400, UserTips.LOGIN_USER_ERROR);
    }
    const { account = "", password = "" } = request.body;
    try {
      const user = await this.instance.prisma.user.findUnique({
        where: {
          account,
          password: encryptPassword(password),
        },
      });
      if (!user) {
        return errRes(400, UserTips.LOGIN_USER_ERROR);
      }
      const token = this.instance.jwt.sign({
        user,
      });
      setCookie(reply, "token", token);
      return sucRes(
        {
          account,
          token,
        },
        UserTips.LOGIN_SUCCESS
      );
    } catch (err) {
      return Promise.reject({
        code: UserTips.LOGIN_USER_ERROR,
        err,
      });
    }
  }

  // 查询用户
  @GET({ url: "/query" })
  async helloHandler(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userList = await this.instance.prisma.user.findMany({
        select: {
          account: true,
          userName: true,
        },
      });
      return sucRes(userList);
    } catch (err) {
      return Promise.reject({
        code: UserTips.QUERY_USER_ERROR,
        err,
      });
    }
  }

  @GET({ url: "/me" })
  async queryMeHandler(request: FastifyRequest, reply: FastifyReply) {
    const token = request.headers["authorization"];
    if (!token) {
      return errRes(401, UserTips.USER_NOT_LOGIN);
    }
    try {
      const jwt = this.instance.jwt.decode(token) as any;
      const account = jwt.user.account;
      // 除去敏感字段
      const user = await this.instance.prisma.user.findUnique({
        where: {
          account,
        },
        select: {
          account: true,
          userName: true,
          date: true,
          email: true,
          avatar: true,
          mobile: true,
          balance: true,
        },
      });
      return sucRes(user);
    } catch (err) {
      console.error(err);
      return errRes(401, UserTips.USER_NOT_LOGIN);
    }
  }

  // 注册新用户
  @POST({
    url: "/register",
    options: {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
  })
  async registerHandler(
    request: FastifyRequest<{
      Body: RegisterUserParams;
    }>,
    reply: FastifyReply
  ) {
    const { account, password, captcha } = request.body;
    if (!account || !password) {
      return errRes(400, UserTips.REGISITER_USER_INFO_MISSING);
    }
    const sessionCaptcha = request.session.get("captcha");
    if (captcha.toLowerCase() !== sessionCaptcha?.toLowerCase()) {
      return errRes(400, UserTips.VERIFY_CAPTCHA_ERROR);
    }
    // 查询是否已存在相同用户名
    try {
      const existUser = await this.instance.prisma.user.findUnique({
        where: {
          account,
        },
      });
      if (existUser) {
        return errRes(400, UserTips.USER_ACCOUNT_DUPLICATE);
      }
    } catch (err) {
      return Promise.reject({
        code: UserTips.REGISTER_USER_ERROR,
        err,
      });
    }

    // 插入新用户
    try {
      const user = await this.instance.prisma.user.create({
        data: {
          account,
          userName: account,
          password: encryptPassword(password),
        },
      });
      const token = this.instance.jwt.sign({
        user,
      });
      setCookie(reply, "token", token);
      return sucRes(
        {
          account,
        },
        UserTips.REGISTER_SUCCESS
      );
    } catch (err) {
      return Promise.reject({
        code: UserTips.REGISTER_USER_ERROR,
        err,
      });
    }
  }

  @POST({ url: "/updatePassword" })
  async updatePasswordHandler(
    request: FastifyRequest<{
      Body: RegisterUserParams;
    }>,
    reply: FastifyReply
  ) {}

  @POST({ url: "/verifyToken" })
  async verifyTokenHandler(request: FastifyRequest, reply: FastifyReply) {
    const token = request.headers["authorization"];
    if (!token) {
      return errRes(401, UserTips.USER_NOT_LOGIN);
    }
    try {
      this.instance.jwt.verify(token);
      const jwt = this.instance.jwt.decode(token) as any;
      const account = jwt.user.account;
      return sucRes(
        {
          account,
          token,
        },
        UserTips.VERIFY_TOKEN_SUCCESS
      );
    } catch (err) {
      console.error(err);
      return errRes(401, UserTips.USER_NOT_LOGIN);
    }
  }

  @Hook("onRequest")
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
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
  async handleQueryUserTips(
    error: FastifyRequestError,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    console.error(error);
    reply.send({
      code: 500,
      message: error.message,
    });
  }
}
