import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  Controller,
  ErrorHandler,
  FastifyInstanceToken,
  GET,
  Hook,
  Inject,
  POST,
} from "fastify-decorators";

import { QueryParams, RechargeParams, TrialParams } from "./balance.type";
import UserTips from "../user/user.tip";

import {
  errRes,
  generateRechargeSecret,
  sucRes,
  validateWhiteList,
} from "@/common/utils";
import { FastifyRequestError } from "@/types/global";
import { generateOrderQrCode } from "@/common/alipay";
import goods from "./goods";

const whiteList: string[] = ["", "/alipayNotify"];

const ROUTER_PREFIX = "/balance";
@Controller({ route: ROUTER_PREFIX })
export default class BalanceController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  @GET({
    url: "/",
    options: {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
  })
  async getBalanceHandler(request: FastifyRequest) {
    return sucRes("ok");
  }

  @POST({ url: "/recharge" })
  async rechargeHandler(
    request: FastifyRequest<{
      Body: RechargeParams;
    }>,
    reply: FastifyReply
  ) {
    const token = request.headers["authorization"];
    this.instance.jwt.decode(token!);
  }

  @POST({ url: "/query" })
  async consumeHandler(
    request: FastifyRequest<{
      Body: QueryParams;
    }>,
    reply: FastifyReply
  ) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const userId = data.user.userName;
  }

  @GET({ url: "/expireTime" })
  async expireHandler(request: FastifyRequest) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const user = await this.instance.prisma.expire.findUnique({
      where: {
        account,
      },
    });
    return sucRes(user);
  }

  @POST({ url: "/trial" })
  async trialHandler(request: FastifyRequest<{ Body: TrialParams }>) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const { machineId } = request.body;
    const machine = await this.instance.prisma.expire.findFirst({
      where: {
        machine_id: machineId.toString(),
      },
    });
    if (machine) {
      return errRes(400, UserTips.MACHINE_TRIALED_ERROR);
    }
    const user = await this.instance.prisma.expire.findUnique({
      where: {
        account: data.user.account,
      },
    });
    if (user) {
      return errRes(400, UserTips.USER_TRIALED_ERROR);
    }
    const expire = await this.instance.prisma.expire.create({
      data: {
        machine_id: machineId.toString(),
        account: data.user.account,
        expire_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        type: "trial",
      },
    });
    return sucRes(expire);
  }

  @POST({ url: "/genKey" })
  async genKeyHandler(request: FastifyRequest) {
    return sucRes(generateRechargeSecret(10));
  }

  @POST({ url: "/alipayNotify" })
  async alipayCallbackHandler(request: FastifyRequest) {
    const result = request.body as any;
    if (result.trade_status !== "TRADE_SUCCESS") {
      return;
    }
    const order = await this.instance.prisma.order.findUnique({
      where: {
        id: result.out_trade_no,
      },
    });

    if (!order) {
      return;
    }
    const targetGood = Object.values(goods).find(
      (item) => item.subject === order.subject
    );
    if (!targetGood) {
      console.log("not found", request.body);
      return;
    }
    await this.instance.prisma.order.update({
      where: {
        id: result.out_trade_no,
      },
      data: {
        status: "paid",
      },
    });
    const existUser = await this.instance.prisma.expire.findFirst({
      where: {
        account: order.account,
      },
    });
    if (existUser) {
      const lastDate = new Date(existUser.expire_time);
      const today = new Date();
      const startDate = lastDate < today ? today : lastDate;
      const expireTime = new Date(startDate.getTime() + targetGood?.time);
      await this.instance.prisma.expire.update({
        where: {
          account: order.account,
        },
        data: {
          expire_time: {
            set: expireTime,
          },
          type: "pay",
        },
      });
      return;
    }
    await this.instance.prisma.expire.create({
      data: {
        machine_id: order.subject,
        account: order.account,
        expire_time: new Date(Date.now() + targetGood?.time),
        type: "pay",
      },
    });
  }

  @GET({ url: "/alipayNotify" })
  async alipayCallbackHandler2(request: FastifyRequest) {
    console.log(request.body);
    console.log(request.params);
    return sucRes("ok");
  }

  @POST({
    url: "/genOrder",
    options: {
      schema: {
        body: {
          type: "object",
          properties: {
            subject: {
              type: "string",
              enum: Object.keys(goods),
            },
          },
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
  })
  async genOrderHandler(
    request: FastifyRequest<{ Body: { subject: string } }>
  ) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const { subject } = request.body;
    const good = goods[subject as keyof typeof goods] ?? goods.DAY;
    const res = await generateOrderQrCode(good.subject, good.price);
    await this.instance.prisma.order.create({
      data: {
        id: res.outTradeNo,
        subject: good.subject,
        amount: good.price,
        account,
        status: "unpay",
      },
    });
    return sucRes(res);
  }

  @GET({
    url: "/queryOrder",
  })
  async queryOrderHandler(
    request: FastifyRequest<{
      Querystring: {
        orderNo: string;
      };
    }>
  ) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const { orderNo } = request.query;
    const order = await this.instance.prisma.order.findUnique({
      where: {
        id: orderNo,
      },
    });
    if (!order) {
      return errRes(400, UserTips.ORDER_NOT_FOUND);
    }
    if (order.account !== account) {
      return errRes(400, UserTips.ORDER_MISTAKE);
    }
    const result = {
      paid: order.status === "paid",
      account: order.account,
      subject: order.subject,
      amount: order.amount,
      date: order.date,
    };
    return sucRes(result, UserTips.ORDER_PAID);
  }

  @GET({
    url: "/queryGoods",
  })
  async queryGoodsHandler(request: FastifyRequest<
    {
      Querystring: {
        pageIndex: string;
        pageSize: string;
      }
    }
  >) {
    const { pageIndex = 0, pageSize = 10 } = request.query;
    const goodList = await this.instance.prisma.goods.findMany({
      skip: +pageIndex * +pageSize,
      take: +pageSize,
    });
    return sucRes(goodList);
  };

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
  async handleQueryBalanceError(
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
