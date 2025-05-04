
const mqtt = require('mqtt'); // 配置 MQTT 参数
const Device = require('../models/Device');
const DeviceOTA = require('../models/DeviceOTA');
const OTATask = require('../models/OTATask');
const { writeMqttLog } = require('./log');
const { getLocalIp } = require('../utils/utils');

// mqtt配置
const mqttConfig = {
  host: process.env.MQTT_BROKER_URL,
  port: 1883,
  options: {
    clientId: 'express-server-' + Math.random().toString(16).substr(2, 8),
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000
  }
};
// 创建 MQTT 客户端
const mqttClient = mqtt.connect(mqttConfig.host, mqttConfig.options);
// 全局订阅状态管理
const subscribedTopics = new Set();
// MQTT 事件监听
mqttClient.on('connect', async () => {
  console.log('✅ Connected to MQTT Broker');
  // 初始订阅数据库中的设备 Topic
  try {
    const devices = await Device.find();
    const topics = devices.map(d => `/devices/${d.deviceId}/sys/messages/up`);

    if (topics.length > 0) {
      mqttClient.subscribe(topics, err => {
        if (err) return console.error('Initial subscribe error:', err);
        topics.forEach(t => subscribedTopics.add(t));
        console.log(`Initial subscribed ${topics.length} topics`);
      });
    }
  } catch (err) {
    console.error('Database query error:', err);
  }
});
mqttClient.on('error', (err) => {
  console.error('MQTT error:', err);
});

const updateStatusList = ['pending', 'running', 'stopping'];
// 判断是否更新OTA任务状态
async function checkAndUpdateOTAStatus(deviceOTA) {
  const otaTask = await OTATask.findById(deviceOTA.otaTask);
  const deviceOTAs = await DeviceOTA.find({ otaTask: deviceOTA.otaTask });
  if (otaTask && deviceOTAs.length > 0) {
    // ota任务中所有设备OTA状态
    const deviceOTAStatusList = [...new Set(deviceOTAs.map(d => d.status))];
    if (deviceOTAStatusList.length === 1 && otaTask.status !== deviceOTAStatusList[0]) {
      // 相同状态
      otaTask.status = deviceOTAStatusList[0];
      await otaTask.save();
    } else if (deviceOTAStatusList.length === 2) {
      // 判断是否更新为新状态
      const otherStatus = deviceOTAStatusList.find(s => s !== deviceOTA.status);
      const otherDeviceOTA = deviceOTAs.filter(d => d._id !== deviceOTA._id);
      if (
        otherDeviceOTA.every(d => d.status === otherStatus) &&
        otaTask.status !== deviceOTA.status &&
        updateStatusList.includes(deviceOTA.status)
      ) {
        otaTask.status = deviceOTA.status;
        await otaTask.save();
      }
    }
  }
}
// 更新设备OTA状态
async function updateDeviceStatus(device, msg) {
  const { status } = msg;
  let _deviceOTA;
  if (status === 'downloading') {
    // 设备正在下载资源包 更新OTA为状态为running
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: 'pending' });
    if (_deviceOTA) {
      _deviceOTA.status = 'running';
      _deviceOTA.description = '下载中';
      await _deviceOTA.save();
    }
  } else if (status === 'download success') {
    // 设备下载资源包成功 更新OTA为状态为pending
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: 'running' });
    if (_deviceOTA) {
      _deviceOTA.status = 'pending';
      _deviceOTA.description = '等待设备空闲';
      _deviceOTA.path = msg.path;
      await _deviceOTA.save();
    }
  } else if (status === 'download failed') {
    // 设备下载资源包失败 更新OTA为状态为failed
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: 'running' });
    if (_deviceOTA) {
      _deviceOTA.status = 'failed';
      _deviceOTA.description = `资源包下载失败，${msg.error}`;
      await _deviceOTA.save();
    }
  } else if (status === 'start update') {
    // 更新OTA为状态为running
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: 'pending' });
    if (_deviceOTA) {
      _deviceOTA.status = 'running';
      _deviceOTA.description = '正在升级中';
      await _deviceOTA.save();
    }
  } else if (status === 'update success') {
    // 更新OTA为状态为completed
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: { $in: ['running', 'stopping'] } });
    if (_deviceOTA) {
      _deviceOTA.status = 'completed';
      _deviceOTA.description = '升级成功';
      await _deviceOTA.save();
      if (device.product.type !== 'Agent') {
        device.version = msg.version;
        await device.save();
      }
    }
  } else if (status === 'update failed') {
    // 更新OTA为状态为failed
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: { $in: ['running', 'stopping'] } });
    if (_deviceOTA) {
      _deviceOTA.status = 'failed';
      _deviceOTA.description = `升级失败：${msg.error}`;
      await _deviceOTA.save();
    }
  } else if (status === 'update stopped') {
    // 更新OTA为状态为canceled
    _deviceOTA = await DeviceOTA.findOne({ device: device._id, status: { $in: ['running', 'stopping'] } });
    if (_deviceOTA) {
      _deviceOTA.status = 'canceled';
      _deviceOTA.description = '';
      _deviceOTA.path = '';
      await _deviceOTA.save();
    }
  }
  // 判断是否更新OTA任务状态
  _deviceOTA && await checkAndUpdateOTAStatus(_deviceOTA);
}
// 判断是否需要下发升级包下载指令
async function deviceOTADownload(device, msg) {
  // const deviceOTA = await DeviceOTA.findOne({ device: device._id, status: { $in: ['pending', 'running'] } });
  const deviceOTA = await DeviceOTA.findOne({ device: device._id, status: 'pending' });
  if (deviceOTA) {
    const otaTask = await OTATask.findById(deviceOTA.otaTask).populate('package');
    if (!otaTask || otaTask.package.version === msg.version) return;
    const topic = `/devices/${device.deviceId}/sys/messages/down`;
    // const baseUrl = getLocalIp() + ':' + process.env.PORT;
    const baseUrl = process.env.DOWNLOAD_BASE_URL;
    if (deviceOTA.description === '查询版本中') {
      // 下发升级包下载指令
      const payload = JSON.stringify({
        type: "OTA",
        url: `${baseUrl}/api/packages/download/${otaTask.package._id}`,
        version: otaTask.package.version,
        filename: otaTask.package.name,
        md5: otaTask.package.md5,
        path: deviceOTA.path,
        entry: otaTask.package.entry,
        processPath: otaTask.package.processPath,
      });
      mqttClient.publish(topic, payload, { qos: 1 });
      console.log(`[OTA] 下发升级包下载指令给设备 ${device.deviceId}`);
    } else if (deviceOTA.description === '等待设备空闲') {
      // TODO 需等待设备空闲状态
      // 下发升级指令
      const payload = JSON.stringify({
        type: "OTA",
        version: otaTask.package.version,
        startUpdate: true,
        path: deviceOTA.path,
        entry: otaTask.package.entry,
        processPath: otaTask.package.processPath,
      });
      mqttClient.publish(topic, payload, { qos: 1 });
      console.log(`[OTA] 下发升级指令给设备 ${device.deviceId}`);
    }
  }
}
// 消息处理
mqttClient.on('message', async (topic, message) => {
  try {
    // 日志记录
    writeMqttLog(topic, message);
    console.log(`[MQTT][${new Date()}] ${topic} => ${message.toString()}`);
    const msg = JSON.parse(message.toString());
    if (topic.indexOf('/sys/messages/up') > -1) {
      // 消息上报，更新设备为在线
      const deviceId = topic.split('/')[2];
      const device = await Device.findOne({ deviceId }).populate('product');
      if (!device) return;
      // 更新活跃时间
      device.lastActive = new Date();
      device.status = 'online';
      await device.save();

      // 设备OTA升级
      if (msg.type === 'OTA') {
        updateDeviceStatus(device, msg);
      } else {
        deviceOTADownload(device, msg);
      }
    }
  } catch (err) {
    console.error('状态更新失败:', err);
  }
});


// 每5秒检测一次离线设备
const OFFLINE_THRESHOLD = 1000 * 5; // 5s
setInterval(async () => {
  try {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD);
    const result = await Device.updateMany(
      {
        status: 'online',
        $or: [
          { lastActive: { $lt: threshold } },
          { lastActive: { $exists: false } }
        ]
      },
      { status: 'offline' }
    );
    if (result.modifiedCount > 0) {
      console.log(`[检测器] 标记 ${result.modifiedCount} 台设备离线`);
    }
  } catch (err) {
    console.error('离线检测失败:', err);
  }
}, OFFLINE_THRESHOLD);

module.exports = { mqttClient, subscribedTopics, checkAndUpdateOTAStatus };
