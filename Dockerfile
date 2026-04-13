# 1. 基础镜像 - 使用 Nginx 作为静态文件服务器
FROM nginx:alpine

# 2. 设置工作目录
WORKDIR /usr/share/nginx/html

# 3. 把当前目录下的所有内容复制到容器的网页目录
COPY . .

# 4. 暴露 80 端口
EXPOSE 80

# 5. 默认启动命令 - Nginx 会自动启动
CMD ["nginx", "-g", "daemon off;"]
