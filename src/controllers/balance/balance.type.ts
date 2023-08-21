// 充值参数
export type RechargeParams = {
  rechargeId: string;
}

// 查询参数
export type QueryParams = {
  userId: string;
}

// 查询过期时间参数
export type QueryExpireParams = {
  account: string;
}

/**
 * 试用参数
 */
export type TrialParams = {
  machineId: string;
}