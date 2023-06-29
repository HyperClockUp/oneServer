import User from "@/types/models/User"

// 用户注册参数
export type RegisterUserParams = {
  account: User['userName'];
  password: User['password']
  captcha: string;
}

// 用户登录参数
export type LoginUserParams = {
  account: User['userName'];
  password: User['password']
}

// 修改密码参数
export type UpdatePasswordParams = {
  password: User['password']
}