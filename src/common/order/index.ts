import { customAlphabet, nanoid } from "nanoid";

const orderNanoId = customAlphabet("1234567890", 6);

/**
 * 生成订单号
 * @returns 格式为 yyyyMMddHHmmssSSS + 6位随机数
 */
export const generateOrderNo = () => {
  const date = new Date();
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  const second = date.getSeconds().toString().padStart(2, "0");
  const millisecond = date.getMilliseconds().toString().padStart(3, "0");
  const orderNo = `${year}${month}${day}${hour}${minute}${second}${millisecond}${orderNanoId()}`;
  return orderNo;
};