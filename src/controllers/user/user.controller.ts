import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject, POST } from 'fastify-decorators';
import UserError from './user.error';
import { FastifyRequestError } from '@/types/global';
import { LoginUserParams, RegisterUserParams } from './user.type';
import UserTips from './user.tip';
import { encryptPassword, errRes, md5, setCookie, sucRes, validateWhiteList } from '@utils/index';

const whiteList = ['/login', '/register'];

const ROUTER_PREFIX = '/user';

@Controller({ route: ROUTER_PREFIX, })
export default class UserController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance

  // 登录
  @POST({
    url: '/login', options: {
      schema: {
        body: {
          type: 'object',
          properties: {
            userName: { type: 'string' },
            password: { type: 'string' },
          },
        }
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    }
  })
  async loginHandler(request: FastifyRequest<{
    Body: LoginUserParams,
  }>, reply: FastifyReply) {
    if (!request.body) {
      return errRes(400, UserError.LOGIN_USER_ERROR);
    }
    const { account = "", password = "" } = request.body;
    try {
      const sqlInstance = await this.instance.mysql.getConnection();
      const [rows, fields] = await sqlInstance.query<any[]>('SELECT * FROM `user` WHERE `account` = ? AND `password` = ?', [account, encryptPassword(password)]);
      sqlInstance.release();
      if (!rows.length) {
        return errRes(400, UserError.LOGIN_USER_ERROR);
      }
      const token = this.instance.jwt.sign({
        user: rows[0]
      });
      setCookie(reply, 'token', token);
      return sucRes({
        account,
      }, UserTips.LOGIN_SUCCESS)
    } catch (err) {
      return Promise.reject({
        code: UserError.LOGIN_USER_ERROR,
        err,
      });
    }
  }

  // 查询用户
  @GET({ url: '/query' })
  async helloHandler(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sqlInstance = await this.instance.mysql.getConnection();
      const [rows, fields] = await sqlInstance.query('SELECT * FROM `user`');
      sqlInstance.release();
      return sucRes(rows);
    } catch (err) {
      return Promise.reject({
        code: UserError.QUERY_USER_ERROR,
        err,
      });
    }
  }

  // 注册新用户
  @POST({
    url: '/register', options: {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    }
  })
  async registerHandler(request: FastifyRequest<{
    Body: RegisterUserParams
  }>, reply: FastifyReply) {
    const { account, password } = request.body;
    if (!account || !password) {
      return errRes(400, UserError.REGISTER_USER_ERROR);
    }
    // 查询是否已存在相同用户名
    try {
      const sqlInstance = await this.instance.mysql.getConnection();
      const [rows, fields] = await sqlInstance.query<any[]>('SELECT * FROM `user` WHERE `account` = ?', [account]);
      sqlInstance.release();
      if (rows.length) {
        return errRes(400, UserError.USER_NAME_DUPLICATE);
      }
    } catch (err) {
      return Promise.reject({
        code: UserError.REGISTER_USER_ERROR,
        err,
      });
    }

    // 插入新用户
    try {
      const sqlInstance = await this.instance.mysql.getConnection();
      await sqlInstance.query('INSERT INTO `user` (`account`, `userName`, `password`) VALUES (?, ?, ?)', [account, account, encryptPassword(password)]);
      sqlInstance.release();
      return sucRes({
        account,
      }, UserTips.REGISTER_SUCCESS);
    } catch (err) {
      return Promise.reject({
        code: UserError.REGISTER_USER_ERROR,
        err,
      });
    }
  }


  @POST({ url: '/updatePassword' })
  async updatePasswordHandler(request: FastifyRequest<{
    Body: RegisterUserParams
  }>, reply: FastifyReply) {
  }

  @POST({ url: '/wechatLogin' })
  async wechatLoginHandler(request: FastifyRequest<{}>, reply: FastifyReply) {

  }

  @Hook('onRequest')
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
    if (validateWhiteList(request.url, whiteList, ROUTER_PREFIX)) {
      return;
    }
    const token = request.headers['authorization'];
    if (!token) {
      reply.code(401).send(errRes(401, UserError.USER_NOT_LOGIN));
      return;
    }
    try {
      this.instance.jwt.verify(token);
    } catch (err) {
      console.error(err);
      reply.code(401).send(errRes(401, UserError.USER_NOT_LOGIN));
    }
  }

  @ErrorHandler()
  async handleQueryUserError(error: FastifyRequestError, request: FastifyRequest, reply: FastifyReply) {
    console.error(error);
    reply.send({
      code: 500,
      message: error.message,
    })
  }
}


