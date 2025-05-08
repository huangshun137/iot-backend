require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { responseFormatter, errorHandler } = require('./middleware/restfulFormatter');
const { mqttClient, subscribedTopics } = require('./config/mqtt');

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors());
app.use(express.json());

// 数据库连接
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// 将客户端挂载到 Express 实例
app.mqttClient = mqttClient;
app.subscribedTopics = subscribedTopics;

// Express配置静态目录
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(responseFormatter);
// 路由
app.use('/api/products', require('./routes/products'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/commands', require('./routes/commands'));
const { router: reqParamsRouter } = require('./routes/reqParams');
app.use('/api/reqParams', reqParamsRouter);
const { router: resParamsRouter } = require('./routes/resParams');
app.use('/api/resParams', resParamsRouter);
app.use('/api/packages', require('./routes/packages'));
app.use('/api/otaTasks', require('./routes/otaTasks'));
app.use('/api/agentDevices', require('./routes/agentDevice'));

// 错误处理（必须放在所有路由之后！）
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[${new Date()}] Server running on port ${PORT}`);
});

// 全局未处理Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 全局未捕获异常
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.stack);
  process.exit(1); // 需要时重启进程
});