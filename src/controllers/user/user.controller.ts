import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject, POST } from 'fastify-decorators';
import UserError from './user.error';
import { FastifyRequestError } from '@/types/global';
import { LoginUserParams, RegisterUserParams } from './user.type';
import UserTips from './user.tip';
import { errRes, md5, sucRes } from '@utils/index';

const whiteList = ['/login', '/register'];

@Controller({ route: '/' })
export default class FirstController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance

  // 登录
  @POST({ url: '/login' })
  async loginHandler(request: FastifyRequest<{
    Body: LoginUserParams,
  }>, reply: FastifyReply) {
    const { userName = "", password = "" } = request.body;
    try {
      const sqlInstance = await this.instance.mysql.getConnection();
      const [rows, fields] = await sqlInstance.query<any[]>('SELECT * FROM `user` WHERE `userName` = ? AND `password` = ?', [userName, md5(password)]);
      sqlInstance.release();
      if (!rows.length) {
        return errRes(400, UserError.LOGIN_USER_ERROR);
      }
      return sucRes({
        userName,
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
  @POST({ url: '/register' })
  async registerHandler(request: FastifyRequest<{
    Body: RegisterUserParams
  }>, reply: FastifyReply) {
    try {
      const { userName, password } = request.body;
      const sqlInstance = await this.instance.mysql.getConnection();
      await sqlInstance.query('INSERT INTO `user` (`userName`, `password`) VALUES (?, ?)', [userName, md5(password)]);
      sqlInstance.release();
      return {
        code: 0,
        data: {
          userName,
          message: UserTips.REGISTER_SUCCESS,
        }
      }
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

  @GET({ url: '/goodbye' })
  async goodbyeHandler() {
    return 'Bye-bye!';
  }

  @Hook('onRequest')
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
    console.log('onRequest', request.url);
    if (whiteList.includes(request.url)) {
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
      message: error.err.message,
    })
  }
}


