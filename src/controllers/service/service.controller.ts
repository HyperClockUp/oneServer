import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Controller, ErrorHandler, FastifyInstanceToken, GET, Hook, Inject, POST } from 'fastify-decorators';
import { FastifyRequestError } from '@/types/global';

const whiteList = ['/login', '/register'];

@Controller({ route: '/service' })
export default class ServiceController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance


  @GET({ url: '/goodbye' })
  async goodbyeHandler() {
    return 'Bye-bye!';
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


