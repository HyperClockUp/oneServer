enum UserError {
  // 查询用户错误
  QUERY_USER_ERROR = 'QUERY_USER_ERROR',
  // 注册用户错误
  REGISTER_USER_ERROR = 'REGISTER_USER_ERROR',
  // 用户名或者密码错误
  LOGIN_USER_ERROR = 'LOGIN_USER_ERROR',
  // 用户暂未登录
  USER_NOT_LOGIN = 'USER_NOT_LOGIN',
}

export default UserError;