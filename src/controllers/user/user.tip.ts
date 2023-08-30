enum UserTips {
  // 注册成功
  REGISTER_SUCCESS = "注册成功",
  // 登录成功
  LOGIN_SUCCESS = "登录成功",
  // 查询用户错误
  QUERY_USER_ERROR = "查询用户失败",
  REGISITER_USER_INFO_MISSING = "注册用户信息不完整",
  // 注册用户错误
  REGISTER_USER_ERROR = "注册用户失败",
  // 用户名或者密码错误
  LOGIN_USER_ERROR = "登录失败",
  // 用户暂未登录
  USER_NOT_LOGIN = "用户暂未登录",
  USER_NOT_FOUND = "用户不存在",
  USER_ACCOUNT_DUPLICATE = "用户账号重复",
  VERIFY_CAPTCHA_ERROR = "验证码验证失败",
  VERIFY_TOKEN_SUCCESS = "token验证成功",
  VERIFY_TOKEN_ERROR = "token验证失败",
  MACHINE_TRIALED_ERROR = "机器已试用",
  USER_TRIALED_ERROR = "用户已试用",
  ORDER_NOT_FOUND = "订单不存在",
  ORDER_NOT_PAID = "订单未支付",
  ORDER_PAID = "订单已支付",
  ORDER_MISTAKE = "订单错误",
  GOOD_NOT_FOUND = "商品不存在",
  CARD_NOT_FOUND = "充值卡不存在",
  CARD_HAS_USED = "充值卡已使用",
}

export default UserTips;
