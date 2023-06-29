import UserTips from "@controllers/user/user.tip";
import { errRes } from "@utils/index";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject } from "fastify-decorators";

import { FastifyRequestError } from "@/types/global";

const whiteList: string[] = ["/"];

@Controller({ route: "/" })
export default class HomeController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  @GET({ url: "/" })
  async handleHome(request: FastifyRequest, reply: FastifyReply) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    if (!data.user.userName) {
      return "Hello World!";
    }
    return `Hello ${data.user.userName}!`;
  }


  @Hook("onRequest")
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
    console.log("onRequest", request.url);
    if (whiteList.includes(request.url)) {
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
  async handleQueryUserTips(error: FastifyRequestError, request: FastifyRequest, reply: FastifyReply) {
    console.error(error);
    reply.send({
      code: 500,
      message: error.message,
    });
  }
}