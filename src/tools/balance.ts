import { generateRechargeSecret } from '@/common/utils';
import { PrismaClient } from '@prisma/client'
import readline from 'readline';

const prisma = new PrismaClient()

const cmd = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const genKeys = async () => {
  const goods = await prisma.goods.findMany();
  // 让用户输入商品id
  console.log('商品列表：');

  goods.forEach((good) => {
    console.log(`id: ${good.id}，subject: ${good.subject}，price: ${good.price}，description: ${good.description}`);
  });

  const getGood = (): Promise<typeof goods[number]> => {
    return new Promise((resolve) => {
      cmd.question('请输入商品id：', (chunk) => {
        const id = parseInt(chunk.toString().trim(), 10);
        if (isNaN(id)) {
          console.log('非法商品id，请重新输入：')
          resolve(getGood());
        }
        const good = goods.find((good) => Number(good.id) === id);
        if (!good) {
          console.log('商品id不存在，请重新输入：')
          return resolve(getGood())
        }
        resolve(good);
      });
    });
  };
  const good: typeof goods[number] = await getGood();

  const getCount = (): Promise<number> => {
    return new Promise((resolve) => {
      cmd.question('请输入生成key的数量：', (chunk) => {
        const count = parseInt(chunk.toString().trim(), 10);
        if (isNaN(count)) {
          console.log('非法数量，请重新输入：');
          resolve(getCount());
        }
        resolve(count);
      });
    });
  };

  // 让用户输入生成key的数量
  const count = await getCount();
  cmd.close();
  // 生成key
  const keys = generateRechargeSecret(count);
  // 入库
  try {
    await prisma.recharge_card.createMany({
      data: keys.map((key) => {
        return {
          recharge_series_no: key,
          good: good.id,
          used: false,
          usage: 'sale',
        }
      }),
    })
    console.log(`成功生成【${good.subject}】key的数量：${count}，请到数据库查看`);
  } catch (e) {
    console.log('生成key失败');
    console.log(e)
  }
}