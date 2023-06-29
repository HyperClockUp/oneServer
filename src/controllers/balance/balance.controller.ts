import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Controller, ErrorHandler, FastifyInstanceToken, Hook, Inject, POST } from "fastify-decorators";

import { QueryParams, RechargeParams } from "./balance.type";
import UserTips from "../user/user.tip";

import { errRes } from "@/common/utils";
import { FastifyRequestError } from "@/types/global";

const whiteList: string[] = [];

@Controller({ route: "/balance" })
export default class BalanceController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  @POST({ url: "/recharge" })
  async rechargeHandler(request: FastifyRequest<{
    Body: RechargeParams,
  }>, reply: FastifyReply) {
    const token = request.headers["authorization"];
    this.instance.jwt.decode(token!);
  }

  @POST({ url: "/query" })
  async consumeHandler(request: FastifyRequest<{
    Body: QueryParams,
  }>, reply: FastifyReply) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const userId = data.user.userName;
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
  async handleQueryBalanceError(error: FastifyRequestError, request: FastifyRequest, reply: FastifyReply) {
    console.error(error);
    reply.send({
      code: 500,
      message: error.message,
    });
  }
}