const http = require('http');

// 成功响应格式化
const responseFormatter = (req, res, next) => {
  // 重写 res.json 方法
  // res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  // res.setHeader('Pragma', 'no-cache');
  const originalJson = res.json;
  res.json = function (data) {
    // 定义白名单
    const whitelist = ['/api/devices/checkUser'];

    // 仅在未自定义格式时生效（防止重复包装）
    if (whitelist.every((item) => req.originalUrl.indexOf(item) === -1) && !this._isFormatted && this.statusCode < 400) {
      const formattedData = {
        status: this.statusCode,
        success: true,
        message: originalJson.message || null,
        data: data
      };
      originalJson.call(this, formattedData);
      this._isFormatted = true; // 标记已格式化
    } else {
      originalJson.call(this, data);
    }
  };
  next();
};

// 错误响应格式化
const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const response = {
    status: statusCode,
    success: false,
    message: err.message || http.STATUS_CODES[statusCode] || 'Unknown Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  res.status(statusCode).json(response);
};

module.exports = { responseFormatter, errorHandler };