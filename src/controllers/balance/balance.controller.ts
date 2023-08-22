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

const whiteList: string[] = ["", "/alipayNotify", "/queryGoods"];

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

  /**
   * 卡密充值
   * @returns
   */
  @POST({
    url: "/recharge",
    options: {
      config: {
        rateLimit: {
          max: 5,
        },
      },
    },
  })
  async rechargeHandler(
    request: FastifyRequest<{
      Body: RechargeParams;
    }>,
    reply: FastifyReply
  ) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const { no } = request.body;
    // 查询充值卡
    const card = await this.instance.prisma.recharge_card.findUnique({
      where: {
        recharge_series_no: no,
      },
    });
    if (!card) {
      return errRes(400, UserTips.CARD_NOT_FOUND);
    }
    // 判断充值卡是否已经使用
    if (card.used) {
      return errRes(400, UserTips.CARD_HAS_USED);
    }
    // 查询商品
    const good = await this.instance.prisma.goods.findUnique({
      where: {
        id: card.good,
      },
    });
    // 判断商品是否存在
    if (!good) {
      return errRes(400, UserTips.GOOD_NOT_FOUND);
    }
    // 查询用户
    const user = await this.instance.prisma.user.findUnique({
      where: {
        account,
      },
    });
    // 判断用户是否存在
    if (!user) {
      return errRes(400, UserTips.USER_NOT_FOUND);
    }
    // 执行事务
    const [rechargeCard, reChargeUser, rechargeHistory] =
      await this.instance.prisma.$transaction([
        // 更新充值卡状态
        this.instance.prisma.recharge_card.update({
          where: {
            recharge_series_no: no,
          },
          data: {
            used: true,
          },
        }),
        // 更新用户余额
        this.instance.prisma.user.update({
          where: {
            account,
          },
          data: {
            balance: {
              increment: good.point || 0,
            },
          },
        }),
        // 更新充值记录
        this.instance.prisma.recharge_history.create({
          data: {
            account,
            recharge_series_no: no,
          },
        }),
      ]);
    return sucRes({
      account: reChargeUser.account,
      balance: reChargeUser.balance,
      usedTime: rechargeHistory.usedTime,
      subject: good.subject,
      point: good.point,
    });
  }

  /**
   * 查询用户余额
   * @param request
   * @param reply
   */
  @POST({ url: "/queryMe" })
  async consumeHandler(
    request: FastifyRequest<{
      Body: QueryParams;
    }>,
    reply: FastifyReply
  ) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const user = await this.instance.prisma.user.findUnique({
      where: {
        account,
      },
    });
    if (!user) {
      return errRes(400, UserTips.USER_NOT_FOUND);
    }
    return sucRes({
      account: user.account,
      balance: user.balance,
    });
  }

  /**
   * 查询用户过期时间
   * @param request
   * @returns
   */
  @GET({ url: "/lol/queryExpire" })
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

  /**
   * 试用服务
   * @param request
   * @returns
   */
  @POST({ url: "/lol/trial" })
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

  /**
   * 支付宝回调
   * @param request
   * @returns
   */
  @POST({ url: "/alipayNotify" })
  async alipayCallbackHandler(request: FastifyRequest) {
    const result = request.body as any;
    if (result.trade_status !== "TRADE_SUCCESS") {
      return;
    }
    // 找到订单
    const order = await this.instance.prisma.order.findUnique({
      where: {
        id: result.out_trade_no,
      },
    });
    if (!order) {
      return errRes(400, UserTips.ORDER_NOT_FOUND);
    }
    // 找到对应的商品
    const targetGood = await this.instance.prisma.goods.findUnique({
      where: {
        id: order.good,
      },
    });
    if (!targetGood) {
      return errRes(400, UserTips.GOOD_NOT_FOUND);
    }
    // 更新订单状态
    await this.instance.prisma.order.update({
      where: {
        id: result.out_trade_no,
      },
      data: {
        status: "paid",
      },
    });
    // 实际更新用户余额
    const prismaPromiseTask = [];
    const increaseTime = targetGood?.time || 0;
    const increasePoint = targetGood?.point || 0;
    // 更新用户过期时间
    if (increaseTime) {
      const existUser = await this.instance.prisma.expire.findFirst({
        where: {
          account: order.account,
        },
      });
      if (existUser) {
        const lastDate = new Date(existUser.expire_time);
        const today = new Date();
        const startDate = lastDate < today ? today : lastDate;
        const expireTime = new Date(startDate.getTime() + increaseTime);
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
      } else {
        await this.instance.prisma.expire.create({
          data: {
            machine_id: order.subject,
            account: order.account,
            expire_time: new Date(Date.now() + increaseTime),
            type: "pay",
          },
        });
      }
    }

    // 更新用户积分
    if (increasePoint) {
      const user = await this.instance.prisma.user.findUnique({
        where: {
          account: order.account,
        },
      });
      if (!user) {
        return;
      }
      await this.instance.prisma.user.update({
        where: {
          account: order.account,
        },
        data: {
          balance: {
            increment: increasePoint,
          },
        },
      });
    }
    return sucRes("ok");
  }

  /**
   * 统一生成订单
   * @param request
   * @returns
   */
  @POST({
    url: "/genOrder",
    options: {
      schema: {
        body: {
          type: "object",
          properties: {
            goodId: {
              type: "number",
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
  async genOrderHandler(request: FastifyRequest<{ Body: { goodId: number } }>) {
    const token = request.headers["authorization"];
    const data = this.instance.jwt.decode(token!) as any;
    const account = data.user.account;
    const { goodId } = request.body;
    // 找到商品
    const good = await this.instance.prisma.goods.findUnique({
      where: {
        id: goodId,
      },
    });
    if (!good) {
      return errRes(400, UserTips.GOOD_NOT_FOUND);
    }
    // 生成支付宝订单
    const res = await generateOrderQrCode(good.subject, good.price);
    // 订单入库
    await this.instance.prisma.order.create({
      data: {
        id: res.outTradeNo,
        good: good.id,
        subject: good.subject,
        amount: good.price.toString(),
        account,
        status: "unpaid",
      },
    });
    return sucRes(res);
  }

  /**
   * 查询订单
   * @param request
   * @returns
   */
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
    // 找到订单
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
    // 返回订单状态
    const result = {
      paid: order.status === "paid",
      account: order.account,
      subject: order.subject,
      amount: order.amount,
      date: order.date,
      goodId: order.good,
    };
    return sucRes(result, UserTips.ORDER_PAID);
  }

  /**
   * 查询所有商品
   * @param request
   * @returns
   */
  @GET({
    url: "/queryGoods",
  })
  async queryGoodsHandler(
    request: FastifyRequest<{
      Querystring: {
        pageIndex: string;
        pageSize: string;
      };
    }>
  ) {
    const { pageIndex = 0, pageSize = 10 } = request.query;
    const goodList = await this.instance.prisma.goods.findMany({
      skip: +pageIndex * +pageSize,
      take: +pageSize,
    });
    return sucRes(goodList);
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
