export const md5 = (str: string | number) => {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(Buffer.from(str.toString()));
  return hash.digest('hex');
}

export const sucRes = (data: any, message = 'ok') => {
  return {
    code: 0,
    data,
    message,
  }
}

export const errRes = (code: number, message: string) => {
  return {
    code,
    message,
  }
}