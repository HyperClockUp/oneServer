import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const createGood = async (param: {
  subject: string;
  price: number;
  description: string;
  point: number;
  time: number;
}) => {
  const { subject, price, description, point = 0, time = 0 } = param;
  if (!point || !time) {
    console.log('积分或时间不可为空')
    return
  }
  try {
    console.log('开始创建商品')
    const good = await prisma.goods.create({
      data: {
        subject,
        price,
        description,
        point,
        time,
      },
    })
    console.log('创建商品成功')
    return good
  } catch (e) {
    console.log(e)
    console.log('创建商品失败')
  }
}

export const queryGoods = async () => {
  try {
    console.log('开始查询商品')
    const goods = await prisma.goods.findMany()
    console.log('查询商品成功')
    return goods
  } catch (e) {
    console.log(e)
    console.log('查询商品失败')
  }
}

