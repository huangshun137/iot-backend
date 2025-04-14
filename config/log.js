const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');

// 日志配置
const LOG_BASE = path.join(__dirname, '../logs'); // 日志存储目录
const TOPIC_CATEGORIES = {
  '/sys/messages/up': 'messages',      // 消息上报
  '/sys/properties/report': 'report',     // 属性上报
};

// 创建日志根目录
fs.ensureDirSync(LOG_BASE);

// 日志记录函数
async function writeMqttLog(topic, message) {
  try {
    // 1. 确定日志分类
    let category = 'other';
    for (const [key, value] of Object.entries(TOPIC_CATEGORIES)) {
      if (topic.includes(key)) {
        category = value;
        break;
      }
    }

    // 2. 创建日期目录
    const date = moment().format('YYYY-MM-DD');
    const logDir = path.join(LOG_BASE, 'mqtt', `${date}_${category}`);
    await fs.ensureDir(logDir);

    // 3. 生成日志文件名
    const filename = `${moment().format('HH')}.log`; // 每小时一个文件
    const logPath = path.join(logDir, filename);

    // 4. 构造日志内容
    const logEntry = JSON.stringify({
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
      topic,
      message: message.toString()
    }) + '\n';

    // 5. 写入文件
    await fs.appendFile(logPath, logEntry);
    
  } catch (err) {
    console.error('日志写入失败:', err);
  }
}

module.exports = { writeMqttLog };
