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
  // 用户名重复
  USER_NAME_DUPLICATE = "用户名重复",
  VERIFY_CAPTCHA_ERROR = "验证码验证失败",
}

export default UserTips;