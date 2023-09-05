import ws, { RawData } from "ws";

enum RemoteCallMessageType {
  UPDATE_CLIENT_SUMMONER_STATUS = "UPDATE_CLIENT_SUMMONER_STATUS",
  UPDATE_CLIENT_REGION_STATUS = "UPDATE_CLIENT_REGION_STATUS",

  QUERY_SUMMONER_MATCH_HISTORY_BY_NAME = "QUERY_SUMMONER_MATCH_HISTORY_BY_NAME",
  QUERY_SUMMONER_MATCH_HISTORY_BY_NAME_ACK = "QUERY_SUMMONER_MATCH_HISTORY_ACK",
  QUERY_SUMMONER_MATCH_HISTORY_BY_NAME_RESULT = "QUERY_SUMMONER_MATCH_HISTORY_BY_NAME",

  QUERY_GAME_DETAIL_BY_GAME_ID = 'QUERY_GAME_DETAIL_BY_GAME_ID',
  QUERY_GAME_DETAIL_BY_GAME_ID_ACK = 'QUERY_GAME_DETAIL_BY_GAME_ID_ACK',
  QUERY_GAME_DETAIL_BY_GAME_ID_RESULT = 'QUERY_GAME_DETAIL_BY_GAME_ID_RESULT',
  
  REMOTE_EXECUTE = "REMOTE_EXECUTE",
  MESSAGE = "MESSAGE",
}

interface RemoteCallMessage<T = any> {
  taskId?: number;
  type: RemoteCallMessageType;
  data: T;
}

const remoteCallTaskPool = new Map<number, RemoteCallPromise>();

const lolRegionRecord = new Map<string, any[]>();

const lolWebSocketServer = new ws.Server({ port: 5001 });

const msg2Buffer = (msg: RemoteCallMessage) => {
  return Buffer.from(JSON.stringify(msg));
};

const arrayBuffer2Msg = (buffer: RawData): RemoteCallMessage => {
  return JSON.parse(buffer.toString());
};

const send = (socket: ws, msg: RemoteCallMessage) => {
  socket.send(msg2Buffer(msg));
};

lolWebSocketServer.on("connection", (socket) => {
  socket.on("open", () => {});

  socket.on("close", () => {
    lolRegionRecord.forEach((sockets) => {
      const index = sockets.indexOf(socket);
      if (index !== -1) {
        sockets.splice(index, 1);
      }
    });
  });

  socket.on("message", (strMsg) => {
    try {
      const msg = arrayBuffer2Msg(strMsg);
      const { type, taskId = 0, data } = msg;
      if (type.endsWith("_ACK") || type.endsWith("_RESULT")) {
        const promise = remoteCallTaskPool.get(taskId);
        if (promise) {
          promise._resolve(msg, socket);
          remoteCallTaskPool.delete(taskId);
        }
        return;
      }
      switch (type) {
        case RemoteCallMessageType.UPDATE_CLIENT_SUMMONER_STATUS: {
          break;
        }
        case RemoteCallMessageType.UPDATE_CLIENT_REGION_STATUS: {
          const { environment, status } = data;
          if (!lolRegionRecord.has(environment?.environment)) {
            lolRegionRecord.set(environment?.environment, []);
          }
          // 记录下当前发送消息的client
          lolRegionRecord.get(environment?.environment)!.push(socket);
          break;
        }
      }
    } catch (e) {
      console.log(e);
    }
  });
});

const broadcast = (msg: RemoteCallMessage) => {
  lolWebSocketServer.clients.forEach((client) => {
    send(client, msg);
  });
};

const remoteCallTaskId = (() => {
  let id = 1;
  return () => {
    return id++;
  };
})();

class RemoteCallPromise {
  _resolve: any;
  _reject: any;
  _promise: Promise<[RemoteCallMessage, ws]>;
  constructor(msg: RemoteCallMessage, sockets: ws[] = []) {
    this._promise = new Promise((resolve, reject) => {
      if (sockets.length) {
        sockets.forEach((s) => {
          send(s, msg);
        });
      } else {
        broadcast(msg);
      }
      const timer = setTimeout(() => {
        this._reject("timeout");
      }, 10000);
      this._resolve = (...args: [RemoteCallMessage, ws]) => {
        clearTimeout(timer);
        resolve(args);
      };
      this._reject = reject;
    });
  }
}

const remoteCall = async (msg: RemoteCallMessage, sockets: ws[] = []) => {
  msg.taskId = remoteCallTaskId();
  const remoteTaskPromise = new RemoteCallPromise(msg, sockets);
  remoteCallTaskPool.set(msg.taskId, remoteTaskPromise);
  return remoteTaskPromise._promise;
};

// setInterval(async () => {
//   try {
//     const [data, socket] = await remoteCall({
//       type: RemoteCallMessageType.REMOTE_EXECUTE,
//       data: {
//         code: "console.log(1)",
//       },
//     });
//   } catch (e) {
//     console.log(e);
//   }
// }, 5000);

lolWebSocketServer.on("listening", () => {
  console.log("listening");
});

export default {
  remoteCall,
  RemoteCallMessageType,
  lolWebSocketServer,
  send,
  broadcast,
  lolRegionRecord,
};
