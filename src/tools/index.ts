import { genKeys } from "./balance";
import { queryGoods } from "./goods";

const task = async () => {
  // const goods = await queryGoods();
  // console.log(goods);
  genKeys();
}

task();