import { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
  Controller,
  ErrorHandler,
  FastifyInstanceToken,
  GET,
  Inject,
  POST,
} from "fastify-decorators";
import { FastifyRequestError } from "@/types/global";
import captcha from "svg-captcha";
import { errRes, sucRes } from "@/common/utils";
import CommonTips from "./common.tip";

@Controller({ route: "/common" })
export default class CommonController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  @GET({ url: "/captcha" })
  async captchaHandler(request: FastifyRequest, reply: FastifyReply) {
    const { data, text } = captcha.create({
      size: 4,
      ignoreChars: "0o1i",
      noise: 2,
      color: true,
    });
    request.session.set("captcha", text);
    reply.type("image/svg+xml");
    reply.send(data);
  }

  @POST({ url: "/verifyCaptcha" })
  async verifyCaptchaHandler(
    request: FastifyRequest<{
      Body: {
        captcha: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { captcha } = request.body;
    const sessionCaptcha = request.session.get("captcha");
    console.log(captcha, sessionCaptcha);
    if (captcha.toLowerCase() !== sessionCaptcha?.toLowerCase()) {
      return errRes(400, CommonTips.VERIFY_CAPTCHA_ERROR);
    }
    return sucRes(null, CommonTips.VERIFY_CAPTCHA_SUCCESS);
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
