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
import axios, { Canceler } from "axios";
import {
  checkTextByBaiDu,
  errRes,
  generateTeamId,
  sucRes,
  translateByBaiDu,
  validateWhiteList,
} from "@/common/utils";
import imageSize from "image-size";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import lolRemoteCall from "@/webSockets/lolRemoteCall";
import UserTips from "../user/user.tip";

const whiteList = [
  "/login",
  "/register",
  "/lol/queryOnlineRegions",
  "/lol/queryOnlineNum",
  "/lol/queryMatchHistory",
  "/lol/queryGameDetail",
];

// 存放任务
const taskList = [] as any[];
// 当前执行任务id
let curExecuteId = "";

const enqueueTask = async <T extends (...args: any) => any>(
  id: string,
  fn: T
) => {
  return new Promise<ReturnType<T>>((res, rej) => {
    taskList.push({
      id,
      fn,
      res,
      rej,
    });
  });
};

const executeTask = async () => {
  const curTask = taskList.shift();
  if (!curTask) {
    setTimeout(executeTask, 0);
    return;
  }
  curExecuteId = curTask.id;
  try {
    const res = await curTask.fn();
    curTask.res(res);
  } catch (error) {
    curTask.rej(error);
  }
  curExecuteId = "";
  setTimeout(executeTask, 0);
};

executeTask();

const cancelTask = (id: string) => {
  const taskIndex = taskList.findIndex((item) => item.id === id);
  if (taskIndex === -1) {
    return;
  }
  const task = taskList.splice(taskIndex, 1)[0];
  task.rej();
};

const interruptSDImage = () => {
  const url = "http://localhost:7860/sdapi/v1/interrupt";
  return axios.post(url);
};

const ROUTER_PREFIX = "/service";
@Controller({ route: ROUTER_PREFIX })
export default class ServiceController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  @POST({ url: "/sdImage" })
  async handleSDImage(
    request: FastifyRequest<{
      Body: {
        image: string;
        ds: number;
        prompt: string;
        negativePrompt: string;
        godMode?: boolean;
      };
    }>,
    reply: FastifyReply
  ) {
    const img = request.body.image;
    const ds = request.body.ds;
    const prompt = request.body.prompt || "";
    const godMode = request.body.godMode || false;
    console.log({
      prompt,
      date: Date.now(),
    });
    if (!godMode) {
      await checkTextByBaiDu(prompt);
    }
    const promptEn = await translateByBaiDu(prompt);
    const negativePrompt = request.body.negativePrompt || "";
    const negativePromptEn = await translateByBaiDu(negativePrompt);
    const buffer = Buffer.from(img, "base64");
    try {
      const filePath = path.resolve(
        __dirname,
        "../../../cache",
        Date.now() + ".jpg"
      );
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      console.log(err);
    }
    const { width = 0, height = 0 } = imageSize(buffer);
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;
    let w = width;
    let h = height;
    if (width > MAX_WIDTH) {
      w = MAX_WIDTH;
      h = Math.floor((height * MAX_WIDTH) / width);
    }
    if (h > MAX_HEIGHT) {
      h = MAX_HEIGHT;
      w = Math.floor((width * MAX_HEIGHT) / height);
    }
    const params = {
      init_images: [img],
      denoising_strength: ds / 100,
      image_cfg_scale: 0,
      mask_blur: 4,
      inpainting_fill: 0,
      inpaint_full_res: true,
      prompt: promptEn,
      negative_prompt: negativePromptEn,
      seed: -1,
      subseed: -1,
      subseed_strength: 0,
      seed_resize_from_h: -1,
      seed_resize_from_w: -1,
      batch_size: 2,
      n_iter: 1,
      steps: 30,
      cfg_scale: 7,
      width: w,
      height: h,
    };
    const url = "http://localhost:7860/sdapi/v1/img2img";
    const taskId = nanoid();
    const taskInfo = {
      id: taskId,
      cancelToken: null as Canceler | null,
    };
    const handleInterrupt = () => {
      cancelTask(taskInfo.id);
      taskInfo.cancelToken?.();
      if (curExecuteId === taskInfo.id) {
        interruptSDImage();
      }
      console.log("任务提前终止");
    };
    request.socket.on("close", handleInterrupt);

    const res = await enqueueTask(taskId, () => {
      return axios.post(url, params, {
        timeout: 1000 * 60 * 5,
        cancelToken: new axios.CancelToken((c) => {
          taskInfo.cancelToken = c;
        }),
      });
    });
    request.socket.off("close", handleInterrupt);
    return sucRes({
      image: res.data.images[0],
    });
  }

  @GET({
    url: "/checkUpdate",
  })
  async checkUpdateHandler(
    request: FastifyRequest<{
      Querystring: {
        service: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { service } = request.query;
    const serviceVersion = await this.instance.prisma.version.findFirst({
      where: {
        service,
      },
    });
    return sucRes(serviceVersion);
  }

  @GET({
    url: "/checkAnnouncement",
  })
  async checkAnnouncementHandler(
    request: FastifyRequest<{
      Querystring: {
        service: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { service } = request.query;
    const serviceAnnouncement =
      await this.instance.prisma.announcement.findFirst({
        where: {
          service,
        },
        orderBy: {
          date: "desc",
        },
      });
    return sucRes(serviceAnnouncement);
  }

  @POST({
    url: "/buildTeam",
  })
  async buildTeamHandler(
    request: FastifyRequest<{
      Body: {
        teamName: string;
        teamMembers: string[];
        teamType: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { teamName, teamMembers } = request.body;
    const EXPIRE_TIME = 60 * 20;
    const teamId = generateTeamId();
    this.instance.redis.sadd(`team:${teamId}`, teamMembers);
    this.instance.redis.sadd("teamList", teamId);
    this.instance.redis.expire(`team:${teamId}`, EXPIRE_TIME);
  }

  @POST({
    url: "/cancelTeam",
  })
  async cancelTeamHandler(
    request: FastifyRequest<{
      Body: {
        teamId: string;
      };
    }>,
    reply: FastifyReply
  ) {}

  @POST({
    url: "/joinTeam",
  })
  async joinTeamHandler(
    request: FastifyRequest<{
      Body: {
        teamId: string;
      };
    }>,
    reply: FastifyReply
  ) {}

  @POST({
    url: "/updateTeam",
  })
  async updateTeamHandler(
    request: FastifyRequest<{
      Body: {
        teamId: string;
      };
    }>,
    reply: FastifyReply
  ) {}

  @POST({
    url: "/teamHeartbeat",
  })
  async teamHeartbeatHandler(
    request: FastifyRequest<{
      Body: {
        teamId: string;
      };
    }>,
    reply: FastifyReply
  ) {
    this.instance.redis.hs;
  }

  @GET({
    url: "/lol/queryMatchHistory",
  })
  async queryRemoteHandler(
    request: FastifyRequest<{
      Querystring: {
        region: string;
        summonerName: string;
        page: number;
        pageSize: number;
      };
    }>,
    reply: FastifyReply
  ) {
    const { region, summonerName, page, pageSize } = request.query;
    const allRegionSocket = lolRemoteCall.lolRegionRecord.get(region);
    if (!allRegionSocket?.length) {
      return errRes(500, UserTips.NO_AVAILABLE_REMOTE_USER);
    }
    try {
      const [task, socket] = await lolRemoteCall.remoteCall({
        type: lolRemoteCall.RemoteCallMessageType
          .QUERY_SUMMONER_MATCH_HISTORY_BY_NAME,
        data: null,
      });
      const [msg, skt] = await lolRemoteCall.remoteCall(
        {
          type: lolRemoteCall.RemoteCallMessageType
            .QUERY_SUMMONER_MATCH_HISTORY_BY_NAME_ACK,
          data: {
            summonerName,
            page: 1,
            pageSize: 10,
          },
        },
        socket ? [socket] : []
      );
      return sucRes(msg.data);
    } catch (error) {
      console.log(error);
      return errRes(500, UserTips.QUERY_REMOTE_MATCH_HISTORY_ERROR);
    }
  }

  @GET({
    url: "/lol/queryGameDetail",
  })
  async queryGameDetailHandler(
    request: FastifyRequest<{
      Querystring: {
        region: string;
        gameId: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { region, gameId } = request.query;
    const allRegionSocket = lolRemoteCall.lolRegionRecord.get(region);
    if (!allRegionSocket?.length) {
      return errRes(500, UserTips.NO_AVAILABLE_REMOTE_USER);
    }
    try {
      const [task, socket] = await lolRemoteCall.remoteCall({
        type: lolRemoteCall.RemoteCallMessageType.QUERY_GAME_DETAIL_BY_GAME_ID,
        data: null,
      });
      const [msg, skt] = await lolRemoteCall.remoteCall(
        {
          type: lolRemoteCall.RemoteCallMessageType
            .QUERY_GAME_DETAIL_BY_GAME_ID_ACK,
          data: {
            gameId,
          },
        },
        socket ? [socket] : []
      );
      return sucRes(msg.data);
    } catch (error) {
      console.log(error);
      return errRes(500, UserTips.QUERY_REMOTE_GAME_DETAIL_ERROR);
    }
  }

  @GET({
    url: "/lol/queryOnlineRegions",
  })
  async queryOnlineRegionsHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    return sucRes([...lolRemoteCall.lolRegionRecord.keys()]);
  }

  @GET({
    url: "/lol/queryOnlineNum",
  })
  async queryOnlineNumHandler(request: FastifyRequest, reply: FastifyReply) {
    const queryResult: Record<string, number> = {};
    for (const [key, value] of lolRemoteCall.lolRegionRecord.entries()) {
      queryResult[key] = value.length;
    }
    return sucRes(queryResult);
  }

  @Hook("onRequest")
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
    console.log("onRequest", request.url);
    if (validateWhiteList(request.url, whiteList, ROUTER_PREFIX)) {
      console.log("white", request.url);
      return;
    }
    console.log("not white", request.url);
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
    console.error(error);
    reply.send({
      code: 500,
      message: error.message,
    });
  }
}
