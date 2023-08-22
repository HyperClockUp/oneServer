import AlipaySdk from "alipay-sdk";
import fs from "fs";
import path from "path";
import { generateOrderNo } from "../order";

const publicKeyPath = path.resolve(__dirname, "./pem/public");
const privateKeyPath = path.resolve(__dirname, "./pem/private");

// TypeScript，可以使用 import AlipaySdk from 'alipay-sdk';
// 普通公钥模式
const alipaySdk = new AlipaySdk({
  appId: "2021004108602532",
  // keyType: 'PKCS1', // 默认值。请与生成的密钥格式保持一致，参考平台配置一节
  privateKey: fs.readFileSync(privateKeyPath, "ascii"),
  alipayPublicKey: fs.readFileSync(publicKeyPath, "ascii"),
});

// 产生订单二维码链接
export const generateOrderQrCode = async (
  subject: string,
  totalAmount: number,
  outTradeNo = generateOrderNo()
) => {
  const result = await alipaySdk.exec("alipay.trade.precreate", {
    notify_url: "https://service.chengfeixiang.cn/balance/alipayNotify",
    bizContent: {
      subject,
      outTradeNo,
      totalAmount,
    },
  });
  return result;
};

export default alipaySdk;
