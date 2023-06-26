import axios from "axios";

const instance = axios.create({
  baseURL: 'https://api.weixin.qq.com',
});

export default instance;